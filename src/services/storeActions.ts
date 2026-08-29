import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import type { CategoryId, GeoPoint } from '../types/firestore';
//店舗のカテゴリを判定する関数を呼び出す

const REGION = 'asia-northeast1';

const CLASSIFY_STORE = 'storeCategories';

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