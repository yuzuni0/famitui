import type { CameraMode, DetectedItem } from '../../types/firestore';
import { callFunction } from './functionsClient';

//撮影した画像の判定を行う Functions を呼び出す

const DETECT_TIMEOUT_MS = 120000;

export type DetectItemsResult = {
  detected: DetectedItem[];
  missing?: DetectedItem[];
};

//撮影した画像から商品を判定する
export async function detectItems(
  familyId: string,
  storagePath: string,
  mode: CameraMode,
): Promise<DetectItemsResult> {
  return callFunction<
    { familyId: string; storagePath: string; mode: CameraMode },
    DetectItemsResult
  >('detectItems', { familyId, storagePath, mode }, { timeoutMs: DETECT_TIMEOUT_MS });
}