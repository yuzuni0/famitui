import { distanceMeters } from '../lib/geo';
import type { GeoPoint } from '../types/firestore';
//MapTiler のAPIを呼ぶ

const GEOCODING_BASE_URL = 'https://api.maptiler.com/geocoding';

//候補の件数
const SEARCH_LIMIT = 10;

//検索結果
export type SearchResult = {
  //MapTilerの識別子
  sourceId: string;
  name: string;
  location: GeoPoint;
  //住所
  address: string | null;
  //検索の中心地点からの距離
  distanceMeters: number;
  osmCategories: string[];
};

type GeocodingContext = {
  id?: unknown;
  text?: unknown;
  text_ja?: unknown;
};

type GeocodingFeature = {
  id?: unknown;
  text?: unknown;
  context?: unknown;
  geometry?: { coordinates?: unknown };
  properties?: { categories?: unknown; feature_tags?: { branch?: unknown } };
};

//住所を示す要素
const ADDRESS_CONTEXT_PREFIXES = [
  'region.',
  'municipality.',
  'locality.',
  'neighbourhood.',
  'address.',
] as const;

type GeocodingResponse = {
  features?: unknown;
};

//idで使えない文字を置き換える
function toSourceId(id: string): string {
  return id.replace(/\//g, '_');
}

//context から表示名を取り出す
function contextText(entry: GeocodingContext): string | null {
  if (typeof entry.text_ja === 'string' && entry.text_ja.length > 0) {
    return entry.text_ja;
  }
  if (typeof entry.text === 'string' && entry.text.length > 0) {
    return entry.text;
  }
  return null;
}

//context の配列から住所を組み立てる
//応答は狭い順に並ぶため、種類ごとに拾い直して広い順に連結する
//番地は OSM に無く応答に含まれないため、町名と通りの粒度が上限になる
function toAddress(context: unknown): string | null {
  if (!Array.isArray(context)) {
    return null;
  }
  const entries = context as GeocodingContext[];

  //種類ごとの表示名
  const values = ADDRESS_CONTEXT_PREFIXES.map(prefix => {
    const entry = entries.find(
      candidate => typeof candidate.id === 'string' && candidate.id.startsWith(prefix),
    );
    return entry === undefined ? null : contextText(entry);
  });
  const [region, municipality, locality, neighbourhood, street] = values;

  const parts: string[] = [];
  if (region !== null) {
    parts.push(region);
  }
  if (municipality !== null) {
    parts.push(municipality);
  }
  //名前の重複を避ける
  if (locality !== null && (neighbourhood === null || !neighbourhood.startsWith(locality))) {
    parts.push(locality);
  }
  if (neighbourhood !== null) {
    parts.push(neighbourhood);
  }
  const area = parts.join('');

  //重複する場合は通りを省略する
  if (street === null || parts.includes(street)) {
    return area.length > 0 ? area : null;
  }
  //通りの前だけ空白で区切る
  return area.length > 0 ? `${area} ${street}` : street;
}

//店名と支店名を組み合わせる
function toStoreName(text: string, branch: unknown): string {
  if (typeof branch !== 'string') {
    return text;
  }
  const trimmed = branch.trim();
  if (trimmed.length === 0 || text.includes(trimmed)) {
    return text;
  }
  return `${text} ${trimmed}`;
}

function toOsmCategories(categories: unknown): string[] {
  if (!Array.isArray(categories)) {
    return [];
  }
  if (!categories.every(entry => typeof entry === 'string')) {
    return [];
  }
  return categories;
}

//feature を SearchResult に変換する
function toSearchResult(feature: GeocodingFeature, center: GeoPoint): SearchResult | null {
  const { id, text, context, geometry, properties } = feature;
  const coordinates = geometry?.coordinates;

  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof text !== 'string' ||
    !Array.isArray(coordinates) ||
    typeof coordinates[0] !== 'number' ||
    typeof coordinates[1] !== 'number'
  ) {
    return null;
  }

  //変換時に緯度経度の順にする
  const [longitude, latitude] = coordinates;
  const location = { latitude, longitude };
  return {
    sourceId: toSourceId(id),
    name: toStoreName(text, properties?.feature_tags?.branch),
    location,
    address: toAddress(context),
    distanceMeters: distanceMeters(center, location),
    osmCategories: toOsmCategories(properties?.categories),
  };
}

//キーワードと現在地から店舗の候補を検索する
export async function searchPlaces(query: string, center: GeoPoint): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    key: process.env.EXPO_PUBLIC_MAPTILER_API_KEY ?? '',
    proximity: `${center.longitude},${center.latitude}`,
    language: 'ja',
    limit: String(SEARCH_LIMIT),
    types: 'poi',
  });
  const url = `${GEOCODING_BASE_URL}/${encodeURIComponent(query)}.json?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`店舗の検索に失敗しました（${response.status}）`);
  }

  const body = (await response.json()) as GeocodingResponse;
  const features = Array.isArray(body.features) ? (body.features as GeocodingFeature[]) : [];

  return features
    .map(feature => toSearchResult(feature, center))
    .filter((result): result is SearchResult => result !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}