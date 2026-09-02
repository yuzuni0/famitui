import { onCall, HttpsError } from "firebase-functions/https";
import { logger } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { CATEGORY_IDS, CategoryId, isCategoryId } from "../lib/categories";
import { OPENAI_MODEL, OPENAI_URL, openaiApiKey } from "../lib/openai";
import { requireAuth, requireMembership, requireString } from "../lib/request";

type DetectedItem = {
  itemName: string;
  label: string;
  category: CategoryId;
};

type StandardLabel = {
  label: string;
  category: CategoryId;
};

// 応答に上限を設ける
const MAX_TOKENS = 1000;

// ドキュメントIDを固定する
const STANDARD_DOC_ID = "default";

function toStandardLabels(value: unknown): StandardLabel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const labels: StandardLabel[] = [];
  for (const raw of value) {
    const entry = raw as { label?: unknown; category?: unknown };
    if (typeof entry?.label !== "string" || entry.label.length === 0) {
      continue;
    }
    if (!isCategoryId(entry.category)) {
      continue;
    }
    labels.push({ label: entry.label, category: entry.category });
  }
  return labels;
}

// ラベル一覧を含めたプロンプト
function buildSystemPrompt(labels: StandardLabel[]): string {
  const labelList = labels.length > 0 ?
    labels.map((entry) => entry.label).join(", ") :
    "(なし)";
  return [
    "あなたは冷蔵庫や棚の写真から、食品と日用品を検出する担当です。",
    "写っている品目を検出し、JSON だけを返してください。",
    "",
    "出力は次の形式にしてください。",
    "{\"items\": [{\"itemName\": \"\", \"label\": \"\", \"category\": \"\"}]}",
    "",
    "itemName は具体的な商品名です。",
    "読み取れなかった場合は label と同じ値にしてください。",
    "label は照合に使う分類名です。",
    `既存の分類名は次の通りです。${labelList}`,
    "該当するものがあれば、その分類名をそのまま使ってください。",
    "該当しない場合は、新しい分類名を label にしてください。",
    `category は次の5つから選んでください。${CATEGORY_IDS.join(", ")}`,
    "",
    "数量は扱いません。",
    "同じ label の品目が複数写っていても、1件にまとめてください。",
    "JSON 以外の文字列は含めないでください。",
  ].join("\n");
}

// 検出結果を返す
function parseDetected(content: string): DetectedItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new HttpsError("internal", "判定の結果を読み取れませんでした。");
  }

  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    throw new HttpsError("internal", "判定の結果の形式が想定と異なります。");
  }

  const detected: DetectedItem[] = [];
  for (const raw of items) {
    const item = raw as {
      itemName?: unknown; label?: unknown;
      category?: unknown;
    };
    if (typeof item?.label !== "string" || item.label.length === 0) {
      continue;
    }
    if (!isCategoryId(item.category)) {
      continue;
    }

    const itemName = typeof item.itemName === "string" &&
      item.itemName.length > 0 ? item.itemName : item.label;

    detected.push({
      itemName,
      label: item.label,
      category: item.category,
    });
  }
  return detected;
}

// 不足品を判定して返す
function missingItems(
  labels: StandardLabel[],
  detected: DetectedItem[]
): DetectedItem[] {
  const detectedLabels = new Set(detected.map((item) => item.label));
  return labels
    .filter((entry) => !detectedLabels.has(entry.label))
    .map((entry) => ({
      itemName: entry.label,
      label: entry.label,
      // 基準に保存されたカテゴリをそのまま使う
      category: entry.category,
    }));
}

// 撮影した画像から商品を判定する
export const detectItems = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 120 },
  async (request) => {
    const uid = requireAuth(request);
    const familyId = requireString(request.data?.familyId, "familyId");
    const storagePath = requireString(request.data?.storagePath, "storagePath");

    const mode = request.data?.mode;
    if (mode !== "baseline" && mode !== "detect") {
      throw new HttpsError(
        "invalid-argument",
        "mode は baseline か detect で指定してください。"
      );
    }

    const familyRef = await requireMembership(getFirestore(), familyId, uid);

    // 画像の判定
    if (!storagePath.startsWith(`families/${familyId}/photos/`)) {
      throw new HttpsError(
        "permission-denied",
        "この画像は判定できません。"
      );
    }

    // 初回に基準の登録を行う
    const standardSnapshot = await familyRef
      .collection("stockStandards")
      .doc(STANDARD_DOC_ID)
      .get();
    const labels = toStandardLabels(standardSnapshot.data()?.labels);

    let base64: string;
    try {
      const [buffer] = await getStorage()
        .bucket()
        .file(storagePath)
        .download();
      base64 = buffer.toString("base64");
    } catch (downloadError) {
      logger.error("画像を読み取れません", { storagePath, downloadError });
      throw new HttpsError("not-found", "画像が見つかりません。");
    }

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: MAX_TOKENS,
        // JSON での応答を強制する
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt(labels) },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "この画像に写っているものを検出してください。",
              },
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${base64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      logger.error("判定に失敗しました", {
        status: response.status,
        body: await response.text(),
      });
      throw new HttpsError("internal", "判定に失敗しました。");
    }

    const data = await response.json() as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new HttpsError("internal", "判定の結果を受け取れませんでした。");
    }

    const detected = parseDetected(content);

    // 基準の登録では算出はしない
    if (mode === "baseline") {
      return { detected };
    }

    return { detected, missing: missingItems(labels, detected) };
  }
);
