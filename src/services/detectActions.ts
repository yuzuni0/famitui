import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import type { CameraMode, DetectedItem } from '../types/firestore';
//判定で扱うCloud Functionsを呼び出す

const REGION = 'asia-northeast1';

const DETECT_ITEMS = 'detectItems';

const DETECT_TIMEOUT_MS = 120000;

//detectItems に渡す引数
type DetectItemsRequest = {
  familyId: string;
  storagePath: string;
  mode: CameraMode;
};

export type DetectItemsResult = {
  detected: DetectedItem[];
  missing?: DetectedItem[];
};

function detectFunctions() {
  return getFunctions(getApp(), REGION);
}

//撮影した画像から商品を判定する
export async function detectItems(
  familyId: string,
  storagePath: string,
  mode: CameraMode,
): Promise<DetectItemsResult> {
  const callable = httpsCallable<DetectItemsRequest, DetectItemsResult>(
    detectFunctions(),
    DETECT_ITEMS,
    { timeout: DETECT_TIMEOUT_MS },
  );
  const response = await callable({ familyId, storagePath, mode });
  return response.data;
}