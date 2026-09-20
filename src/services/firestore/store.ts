import { collection, doc, getDocs, getFirestore, orderBy, query } from '@react-native-firebase/firestore';
import type { StoreDoc } from '../../types/firestore';
import { FAMILIES_COLLECTION, observeCollection, observeDoc } from './observe';
import type { WithId } from './observe';
//stores の読み取りを行う

const STORES_COLLECTION = 'stores';

//ドキュメントIDを含めた店舗
export type StoreWithId = WithId<StoreDoc>;

//stores への参照を行う
function storesCollectionRef(familyId: string) {
  return collection(getFirestore(), FAMILIES_COLLECTION, familyId, STORES_COLLECTION);
}

function storeDocRef(familyId: string, storeId: string) {
  return doc(getFirestore(), FAMILIES_COLLECTION, familyId, STORES_COLLECTION, storeId);
}

//店舗の変化を監視する
export function observeStores(
  familyId: string,
  callback: (stores: StoreWithId[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeCollection<StoreDoc>(
    query(storesCollectionRef(familyId), orderBy('createdTime', 'desc')),
    `observeStores failed: ${familyId}`,
    callback,
    onError,
  );
}

//保存済みの店舗を1回読む
export async function fetchStores(familyId: string): Promise<StoreWithId[]> {
  const snapshot = await getDocs(storesCollectionRef(familyId));
  return snapshot.docs.map(document => ({
    id: document.id,
    ...(document.data() as StoreDoc),
  }));
}

//各店舗の変化を監視する
export function observeStore(
  familyId: string,
  storeId: string,
  callback: (store: StoreWithId | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeDoc<StoreDoc>(
    storeDocRef(familyId, storeId),
    `observeStore failed: ${familyId}/${storeId}`,
    callback,
    onError,
  );
}