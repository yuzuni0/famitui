import { onCall, HttpsError } from "firebase-functions/https";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  CategoryId, categoryListForPrompt, toCategoryIds,
} from "../lib/categories";
import { openaiApiKey, requestClassification } from "../lib/openai";
import {
  isStringArray, requireAuth, requireGeoPoint,
  requireMembership, requireNonEmptyString,
} from "../lib/request";

// APIの出力・トークン設定
const MAX_TOKENS = 200;

const STORE_NAME_MAX_LENGTH = 50;

const ADDRESS_MAX_LENGTH = 200;

// APIへのプロンプト
function buildPrompt(storeName: string, osmCategories: string[]): string {
  const tagList = osmCategories.length > 0 ?
    osmCategories.join(", ") :
    "(なし)";
  return [
    "あなたは店舗で購入できる商品のカテゴリを判定する担当です。",
    "店舗名と OpenStreetMap のタグから判定し、JSON だけを返してください。",
    "",
    `店舗名: ${storeName}`,
    `タグ: ${tagList}`,
    "",
    `カテゴリは次の5つです。${categoryListForPrompt()}`,
    "この店舗で購入できるカテゴリをすべて選んでください。",
    "判断がつかない場合は、日本の一般的な店舗の実態に基づいて推定してください。",
    "",
    "出力は次の形式にしてください。",
    "{\"categories\": [\"dailyGoods\", ...]}",
    "JSON 以外の文字列は含めないでください。",
    "5つのカテゴリのいずれも購入できない店舗（携帯電話ショップ、整骨院、旅行代理店、",
    "美容室、不動産、レンタル店、展示施設など）は、categories を空配列 [] にしてください。",
    "無理に割り当てないでください。",
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
  return toCategoryIds(categories);
}

// APIを呼び出して店のカテゴリを判定する
async function classifyCategories(
  storeName: string,
  osmCategories: string[]
): Promise<CategoryId[]> {
  const content = await requestClassification(
    buildPrompt(storeName, osmCategories),
    MAX_TOKENS,
    { storeName }
  );
  if (content === null) {
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
    const uid = requireAuth(request);

    const familyId = requireNonEmptyString(request.data?.familyId, "familyId");
    const sourceId = requireNonEmptyString(request.data?.sourceId, "sourceId");

    const storeName = requireNonEmptyString(
      request.data?.storeName,
      "storeName"
    );
    if (storeName.length > STORE_NAME_MAX_LENGTH) {
      throw new HttpsError(
        "invalid-argument",
        `storeName は${STORE_NAME_MAX_LENGTH}文字以内で指定してください。`
      );
    }

    const location = requireGeoPoint(request.data?.location, "location");

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
    const familyRef = await requireMembership(db, familyId, uid);

    // 保存されていればその値を返す
    const storeRef = familyRef.collection("stores").doc(sourceId);
    const storeSnapshot = await storeRef.get();
    if (storeSnapshot.exists) {
      const saved = storeSnapshot.data()?.categories;
      const categories = Array.isArray(saved) ? toCategoryIds(saved) : [];
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
