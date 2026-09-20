import type { CategoryId, GeoPoint } from '../../types/firestore';
import { callFunction } from './functionsClient';
import type { StoreCandidate } from '../api/overpass';

//店舗のカテゴリを判定する Functions を呼び出す

const SEARCH_NEARBY_TIMEOUT_MS = 120000;

// MapTilerの応答から店舗のカテゴリを判定する
export type ClassifyStoreInput = {
  //MapTilerの識別子
  sourceId: string;
  storeName: string;
  location: GeoPoint;
  address: string | null;
  osmCategories: string[];
};

export type ClassifyStoreResult = {
  storeId: string;
  categories: CategoryId[];
};

//現在地の周辺で見つかった店舗の情報
export type NearbyStore = {
  storeId: string;
  storeName: string;
  location: GeoPoint;
  categories: CategoryId[];
};

//店舗のカテゴリを判定して登録する
export async function classifyStore(
  familyId: string,
  input: ClassifyStoreInput,
): Promise<ClassifyStoreResult> {
  return callFunction<ClassifyStoreInput & { familyId: string }, ClassifyStoreResult>(
    'storeCategories',
    { familyId, ...input },
  );
}

//候補の店舗を取得する(カテゴリ付き)
export async function searchNearbyStores(
  familyId: string,
  center: GeoPoint,
  candidates: StoreCandidate[] | null,
): Promise<NearbyStore[]> {
  const result = await callFunction<
    { familyId: string; center: GeoPoint; candidates: StoreCandidate[] | null },
    { stores: NearbyStore[] }
  >('searchNearbyStores', { familyId, center, candidates }, {
    timeoutMs: SEARCH_NEARBY_TIMEOUT_MS,
  });
  return result.stores;
}