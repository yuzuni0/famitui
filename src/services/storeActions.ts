import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import type { CategoryId, GeoPoint } from '../types/firestore';
import type { StoreCandidate } from './overpass';
//店舗のカテゴリを判定する関数を呼び出す

const REGION = 'asia-northeast1';

const CLASSIFY_STORE = 'storeCategories';

const SEARCH_NEARBY_STORES = 'searchNearbyStores';

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

type ClassifyStoreRequest = ClassifyStoreInput & {
  familyId: string;
};

export type ClassifyStoreResult = {
  storeId: string;
  categories: CategoryId[];
};

// 現在地の周辺で見つかった店舗を検索する
type SearchNearbyStoresRequest = {
  familyId: string;
  center: GeoPoint;
  candidates: StoreCandidate[];
};

//現在地の周辺で見つかった店舗の情報
export type NearbyStore = {
  storeId: string;
  storeName: string;
  location: GeoPoint;
  categories: CategoryId[];
};

export type SearchNearbyStoresResult = {
  stores: NearbyStore[];
};

function storeFunctions() {
  return getFunctions(getApp(), REGION);
}

//店舗のカテゴリを判定して登録する
export async function classifyStore(
  familyId: string,
  input: ClassifyStoreInput,
): Promise<ClassifyStoreResult> {
  const callable = httpsCallable<ClassifyStoreRequest, ClassifyStoreResult>(
    storeFunctions(),
    CLASSIFY_STORE,
  );
  const response = await callable({ familyId, ...input });
  return response.data;
}

//候補の店舗を取得する
export async function searchNearbyStores(
  familyId: string,
  center: GeoPoint,
  candidates: StoreCandidate[],
): Promise<NearbyStore[]> {
  const callable = httpsCallable<SearchNearbyStoresRequest, SearchNearbyStoresResult>(
    storeFunctions(),
    SEARCH_NEARBY_STORES,
    { timeout: SEARCH_NEARBY_TIMEOUT_MS },
  );
  const response = await callable({ familyId, center, candidates });
  return response.data.stores;
}