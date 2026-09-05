import { isGeoPoint } from '../lib/geo';
import type { GeoPoint } from '../types/firestore';
//Overpass API で周辺の店舗を取得する
//外部APIの呼び出しのみを担い、Firestore には触れない

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

//検索する半径
export const SEARCH_RADIUS_METERS = 700;

//ジオフェンスの上限
const MAX_STORES = 80;

const QUERY_TIMEOUT_SECONDS = 25;

const FETCH_TIMEOUT_MS = 15000;

//Cloud Functions に渡す店舗の候補
export type StoreCandidate = {
  sourceId: string;
  storeName: string;
  location: GeoPoint;
  osmCategories: string[];
};

type OverpassElement = {
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  tags?: { name?: unknown; shop?: unknown };
};

type OverpassResponse = {
  elements?: unknown;
};

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

//Overpassに与えるクエリ
function buildOverpassQuery(center: GeoPoint): string {
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_SECONDS}];`,
    `node["shop"](around:${SEARCH_RADIUS_METERS},${center.latitude},${center.longitude});`,
    `out body ${MAX_STORES};`,
  ].join('');
}

// OverPassの要素を StoreCandidate に変換する
function toStoreCandidate(element: OverpassElement): StoreCandidate | null {
  if (typeof element.id !== 'number') {
    return null;
  }
  const location = { latitude: element.lat, longitude: element.lon };
  if (!isGeoPoint(location)) {
    return null;
  }
  const storeName = element.tags?.name;
  if (typeof storeName !== 'string' || storeName.length === 0) {
    return null;
  }
  const shop = element.tags?.shop;

  return {
    sourceId: `osm.n${element.id}`,
    storeName,
    location,
    osmCategories: typeof shop === 'string' ? [shop] : [],
  };
}

//応答から店舗の候補を取り出す
function parseOverpassElements(body: OverpassResponse): StoreCandidate[] {
  const elements = Array.isArray(body.elements) ? (body.elements as OverpassElement[]) : [];
  return elements
    .map(toStoreCandidate)
    .filter((candidate): candidate is StoreCandidate => candidate !== null);
}

async function fetchFromServer(url: string, query: string): Promise<OverpassResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'famitui/1.0 (student project)',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: timeoutSignal(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`周辺の店舗の検索に失敗しました（${response.status}）`);
  }
  return (await response.json()) as OverpassResponse;
}

//現在地の周辺の店舗の候補を取得する
export async function fetchNearbyCandidates(center: GeoPoint): Promise<StoreCandidate[]> {
  const query = buildOverpassQuery(center);
  let lastError: unknown = null;

  for (const url of OVERPASS_URLS) {
    const startedAt = Date.now();
    try {
      const body = await fetchFromServer(url, query);
      console.log(`[overpass] ${url} ok ms=${Date.now() - startedAt}`);
      return parseOverpassElements(body);
    } catch (error) {
      console.warn(`[overpass] ${url} failed ms=${Date.now() - startedAt}`, error);
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('周辺の店舗を検索できませんでした。');
}