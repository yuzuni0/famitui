import { onCall, HttpsError } from "firebase-functions/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import {
  CategoryId, categoryListForPrompt, isCategoryId,
} from "../lib/categories";
import { GeoPoint, distanceMeters, isGeoPoint } from "../lib/geo";

const openaiApiKey = defineSecret("OPENAI_API_KEY");

// ジオフェンスの登録上限
const MAX_STORES = 80;

const SOURCE_ID_PREFIX = "osm.n";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const MODEL = "gpt-4o";

// 使うトークン
const MAX_TOKENS = 2000;

// アプリ側の StoreCandidate に距離を加えたもの
type Candidate = {
  sourceId: string;
  storeName: string;
  location: GeoPoint;
  osmCategories: string[];
  distance: number;
};

// 呼び出し元に渡す店舗の情報
type StoreResult = {
  storeId: string;
  storeName: string;
  location: GeoPoint;
  categories: CategoryId[];
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string");
}

// 取得した店舗の情報を Candidate に変換する
function toCandidate(raw: unknown, center: GeoPoint): Candidate | null {
  const entry = raw as {
    sourceId?: unknown;
    storeName?: unknown;
    location?: unknown;
    osmCategories?: unknown;
  };
  const sourceId = entry?.sourceId;
  if (!isNonEmptyString(sourceId) || !sourceId.startsWith(SOURCE_ID_PREFIX)) {
    return null;
  }
  const storeName = entry?.storeName;
  if (!isNonEmptyString(storeName)) {
    return null;
  }
  const location = entry?.location;
  if (!isGeoPoint(location)) {
    return null;
  }
  const osmCategories = entry?.osmCategories;
  if (!isStringArray(osmCategories)) {
    return null;
  }

  return {
    sourceId,
    storeName,
    location: { latitude: location.latitude, longitude: location.longitude },
    osmCategories,
    distance: distanceMeters(center, location),
  };
}

// 店舗を判定するプロンプト
function buildPrompt(candidates: Candidate[]): string {
  const storeList = candidates.map((candidate, index) => {
    const tagList = candidate.osmCategories.length > 0 ?
      candidate.osmCategories.join(", ") :
      "なし";
    return `${index}. ${candidate.storeName} (${tagList})`;
  });
  return [
    "あなたは店舗で購入できる商品のカテゴリを判定する担当です。",
    "店舗名と OpenStreetMap の shop タグから判定し、JSON だけを返してください。",
    "",
    "店舗の一覧:",
    ...storeList,
    "",
    `カテゴリは次の5つです。${categoryListForPrompt()}`,
    "各店舗で購入できるカテゴリをすべて選んでください。",
    "判断がつかない場合は、日本の一般的な店舗の実態に基づいて推定してください。",
    "",
    "出力は次の形式にしてください。index は一覧の番号です。",
    "すべての店舗について返してください。",
    "{\"stores\": [{\"index\": 0, \"categories\": [\"dailyGoods\", ...]}, " +
    "...]}",
    "JSON 以外の文字列は含めないでください。",
    "5つのカテゴリのいずれも購入できない店舗（携帯電話ショップ、整骨院、旅行代理店、",
    "美容室、不動産、レンタル店、展示施設など）は、categories を空配列 [] にしてください。",
    "無理に割り当てないでください。",
  ].join("\n");
}

// 判定の結果を店舗ごとのカテゴリに変換する
function parseBatchCategories(
  content: string,
  count: number
): CategoryId[][] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }

  const stores = (parsed as { stores?: unknown })?.stores;
  if (!Array.isArray(stores)) {
    return null;
  }

  // indexごとにカテゴリをまとめる
  const result: CategoryId[][] = Array.from({ length: count }, () => []);
  for (const raw of stores) {
    const entry = raw as { index?: unknown; categories?: unknown };
    const index = entry?.index;
    if (
      typeof index !== "number" ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= count
    ) {
      continue;
    }
    if (!Array.isArray(entry.categories)) {
      continue;
    }
    const categories: CategoryId[] = [];
    for (const category of entry.categories) {
      if (isCategoryId(category) && !categories.includes(category)) {
        categories.push(category);
      }
    }
    result[index] = categories;
  }
  return result;
}

// 対象店舗をまとめて判定する
async function classifyCategoriesBatch(
  candidates: Candidate[]
): Promise<CategoryId[][]> {
  const fallback = candidates.map((): CategoryId[] => []);
  if (candidates.length === 0) {
    return fallback;
  }

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
        response_format: { type: "json_object" },
        messages: [
          { role: "user", content: buildPrompt(candidates) },
        ],
      }),
    });
  } catch (fetchError) {
    logger.error("カテゴリの判定を呼び出せません", {
      count: candidates.length,
      fetchError,
    });
    return fallback;
  }

  if (!response.ok) {
    logger.error("カテゴリの判定に失敗しました", {
      count: candidates.length,
      status: response.status,
      body: await response.text(),
    });
    return fallback;
  }

  const data = await response.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    logger.error("カテゴリの判定の結果を受け取れませんでした", {
      count: candidates.length,
    });
    return fallback;
  }

  const categories = parseBatchCategories(content, candidates.length);
  if (categories === null) {
    // 座標だけでジオフェンスを行う
    logger.error("カテゴリの判定の結果を読み取れませんでした", {
      count: candidates.length,
      content,
    });
    return fallback;
  }
  return categories;
}

// 現在地の周辺の店舗をカテゴリ付きで返す
export const searchNearbyStores = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }
    const uid = request.auth.uid;

    const familyId = request.data?.familyId;
    if (typeof familyId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "familyId は文字列で指定してください。"
      );
    }

    // 距離順の並べ替え
    const center = request.data?.center;
    if (!isGeoPoint(center)) {
      throw new HttpsError(
        "invalid-argument",
        "center は有効な座標で指定してください。"
      );
    }

    const rawCandidates = request.data?.candidates;
    if (!Array.isArray(rawCandidates)) {
      throw new HttpsError(
        "invalid-argument",
        "candidates は配列で指定してください。"
      );
    }
    if (rawCandidates.length > MAX_STORES) {
      throw new HttpsError(
        "invalid-argument",
        `candidates は${MAX_STORES}件以内で指定してください。`
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

    // 各ログに経過時間をる
    const startedAt = Date.now();
    const elapsedMs = () => Date.now() - startedAt;

    // 距離順に並べる
    const candidates = rawCandidates
      .map((raw) => toCandidate(raw, center))
      .filter((candidate): candidate is Candidate => candidate !== null)
      .sort((a, b) => a.distance - b.distance);
    logger.info("候補を受け取りました", {
      received: rawCandidates.length,
      accepted: candidates.length,
      elapsedMs: elapsedMs(),
    });
    if (candidates.length === 0) {
      return { stores: [] };
    }

    // 既存の店舗をFirestoreから取得する
    const storesRef = familyRef.collection("stores");
    const refs = candidates.map((c) => storesRef.doc(c.sourceId));
    const snapshots = await db.getAll(...refs);

    const categoriesById = new Map<string, CategoryId[]>();
    const unknown: Candidate[] = [];
    candidates.forEach((candidate, index) => {
      const snapshot = snapshots[index];
      if (snapshot.exists) {
        const saved = snapshot.data()?.categories;
        categoriesById.set(
          candidate.sourceId,
          Array.isArray(saved) ? saved.filter(isCategoryId) : []
        );
      } else {
        unknown.push(candidate);
      }
    });

    // 新規の店舗をまとめて判定する
    logger.info("gpt-4o の呼び出しを開始します", {
      known: candidates.length - unknown.length,
      unknown: unknown.length,
      elapsedMs: elapsedMs(),
    });
    const classifyStartedAt = Date.now();
    const classified = await classifyCategoriesBatch(unknown);
    logger.info("gpt-4o の呼び出しが終わりました", {
      classifyMs: Date.now() - classifyStartedAt,
      elapsedMs: elapsedMs(),
    });

    // 判定した店舗をstoresに保存する
    const batch = db.batch();
    unknown.forEach((candidate, index) => {
      const categories = classified[index];
      categoriesById.set(candidate.sourceId, categories);
      batch.set(storesRef.doc(candidate.sourceId), {
        storeName: candidate.storeName,
        location: {
          latitude: candidate.location.latitude,
          longitude: candidate.location.longitude,
        },
        address: null,
        categories,
        sourceId: candidate.sourceId,
        creatorUserId: uid,
        createdTime: FieldValue.serverTimestamp(),
      });
    });
    if (unknown.length > 0) {
      await batch.commit();
    }

    // 既知と新規を合わせ、距離が近い順のまま返す
    const results: StoreResult[] = candidates.map((candidate) => ({
      storeId: candidate.sourceId,
      storeName: candidate.storeName,
      location: candidate.location,
      categories: categoriesById.get(candidate.sourceId) ?? [],
    }));
    return { stores: results };
  }
);
