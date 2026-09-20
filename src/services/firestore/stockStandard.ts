import { doc, getFirestore, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import type { StandardLabel, StockStandardDoc } from '../../types/firestore';
import { FAMILIES_COLLECTION, observeDocData } from './observe';

const STOCK_STANDARDS_COLLECTION = 'stockStandards';

//ドキュメントIDを固定する
const STANDARD_DOC_ID = 'default';

//default への参照を行う
function stockStandardDocRef(familyId: string) {
  return doc(
    getFirestore(),
    FAMILIES_COLLECTION,
    familyId,
    STOCK_STANDARDS_COLLECTION,
    STANDARD_DOC_ID,
  );
}

//基準を上書きする
export async function updateStockStandard(
  familyId: string,
  uid: string,
  labels: StandardLabel[],
): Promise<void> {
  await setDoc(stockStandardDocRef(familyId), {
    labels,
    updatedTime: serverTimestamp(),
    updaterUserId: uid,
  });
}

//基準の変化を監視する
export function observeStockStandard(
  familyId: string,
  callback: (standard: StockStandardDoc | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeDocData<StockStandardDoc>(
    stockStandardDocRef(familyId),
    `observeStockStandard failed: ${familyId}`,
    callback,
    onError,
  );
}