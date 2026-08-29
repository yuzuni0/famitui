import { onCall, HttpsError } from "firebase-functions/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const openaiApiKey = defineSecret("OPENAI_API_KEY");

const CATEGORY_IDS = [
  "dailyGoods",
  "beverage",
  "food",
  "freshFood",
  "stationery",
] as const;

type CategoryId = (typeof CATEGORY_IDS)[number];

// プロンプトで提示する時のカテゴリ
const CATEGORY_LABELS: Record<CategoryId, string> = {
  dailyGoods: "日用品",
  beverage: "飲料",
  food: "食品",
  freshFood: "生鮮食品",
  stationery: "文房具",
};

type GeoPoint = {
  latitude: number;
  longitude: number;
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const MODEL = "gpt-4o";

// APIの出力・トークン設定
const MAX_TOKENS = 200;

const STORE_NAME_MAX_LENGTH = 50;

const ADDRESS_MAX_LENGTH = 200;

function isCategoryId(value: unknown): value is CategoryId {
  return CATEGORY_IDS.includes(value as CategoryId);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// 緯度と経度の範囲を確認する
function isGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { latitude, longitude } = value as {
    latitude?: unknown; longitude?: unknown;
  };
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return false;
  }
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return false;
  }
  return latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string");
}

// APIへのプロンプト
function buildPrompt(storeName: string, osmCategories: string[]): string {
  const tagList = osmCategories.length > 0 ?
    osmCategories.join(", ") :
    "(なし)";
  const categoryList = CATEGORY_IDS
    .map((id) => `${id}（${CATEGORY_LABELS[id]}）`)
    .join(", ");
  return [
    "あなたは店舗で購入できる商品のカテゴリを判定する担当です。",
    "店舗名と OpenStreetMap のタグから判定し、JSON だけを返してください。",
    "",
    `店舗名: ${storeName}`,
    `タグ: ${tagList}`,
    "",
    `カテゴリは次の5つです。${categoryList}`,
    "この店舗で購入できるカテゴリをすべて選んでください。",
    "判断がつかない場合は、日本の一般的な店舗の実態に基づいて推定してください。",
    "",
    "出力は次の形式にしてください。",
    "{\"categories\": [\"dailyGoods\", ...]}",
    "JSON 以外の文字列は含めないでください。",
  ].join("\n");
}

// APIの判定の結果を返す
function parseCategories(content: string): CategoryId[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const categories = (parsed as { categories?: unknown })?.categories;
  if (!Array.isArray(categories)) {
    return null;
  }

  const result: CategoryId[] = [];
  for (const raw of categories) {
    if (isCategoryId(raw) && !result.includes(raw)) {
      result.push(raw);
    }
  }
  return result;
}

// APIを呼び出して店のカテゴリを判定する
async function classifyCategories(
  storeName: string,
  osmCategories: string[]
): Promise<CategoryId[]> {
  let response: Response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // JSON形式
        response_format: { type: "json_object" },
        messages: [
          { role: "user", content: buildPrompt(storeName, osmCategories) },
        ],
      }),
    });
  } catch (fetchError) {
    logger.error("カテゴリの判定を呼び出せません", { storeName, fetchError });
    return [];
  }

  if (!response.ok) {
    logger.error("カテゴリの判定に失敗しました", {
      storeName,
      status: response.status,
      body: await response.text(),
    });
    return [];
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    logger.error("カテゴリの判定の結果を受け取れませんでした", { storeName });
    return [];
  }

  const categories = parseCategories(content);
  if (categories === null) {
    logger.error("カテゴリの判定の結果を読み取れませんでした", {
      storeName,
      content,
    });
    return [];
  }
  return categories;
}

// 店のカテゴリを保存する
export const storeCategories = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }
    const uid = request.auth.uid;

    const familyId = request.data?.familyId;
    if (!isNonEmptyString(familyId)) {
      throw new HttpsError(
        "invalid-argument",
        "familyId は文字列で指定してください。"
      );
    }

    const sourceId = request.data?.sourceId;
    if (!isNonEmptyString(sourceId)) {
      throw new HttpsError(
        "invalid-argument",
        "sourceId は文字列で指定してください。"
      );
    }

    const storeName = request.data?.storeName;
    if (!isNonEmptyString(storeName)) {
      throw new HttpsError(
        "invalid-argument",
        "storeName は文字列で指定してください。"
      );
    }
    if (storeName.length > STORE_NAME_MAX_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `storeName は${STORE_NAME_MAX_LENGTH}文字以内で指定してください。`
      );
    }

    const location = request.data?.location;
    if (!isGeoPoint(location)) {
      throw new HttpsError(
        "invalid-argument",
        "location は有効な座標で指定してください。"
      );
    }

    const address = request.data?.address;
    if (address !== null && typeof address !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "address は null か文字列で指定してください。"
      );
    }
    if (address !== null && address.length > ADDRESS_MAX_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `address は${ADDRESS_MAX_LENGTH}文字以内で指定してください。`
      );
    }

    const osmCategories = request.data?.osmCategories;
    if (!isStringArray(osmCategories)) {
      throw new HttpsError(
        "invalid-argument",
        "osmCategories は文字列の配列で指定してください。"
      );
    }

    const db = getFirestore();
    const familyRef = db.collection("families").doc(familyId);

    const memberSnapshot = await familyRef.collection("members").doc(uid).get();
    if (!memberSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "この家族グループに所属していません。"
      );
    }

    // 保存されていればその値を返す
    const storeRef = familyRef.collection("stores").doc(sourceId);
    const storeSnapshot = await storeRef.get();
    if (storeSnapshot.exists) {
      const saved = storeSnapshot.data()?.categories;
      const categories = Array.isArray(saved) ? saved.filter(isCategoryId) : [];
      return { storeId: sourceId, categories };
    }

    const categories = await classifyCategories(storeName, osmCategories);

    await storeRef.set({
      storeName,
      // 引数の値を保存する
      location: { latitude: location.latitude, longitude: location.longitude },
      address,
      categories,
      sourceId,
      creatorUserId: uid,
      createdTime: FieldValue.serverTimestamp(),
    });

    return { storeId: sourceId, categories };
  }
);
