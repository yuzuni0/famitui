import { collection, doc, getFirestore, onSnapshot, orderBy, query } from '@react-native-firebase/firestore';
import type { StoreDoc } from '../types/firestore';
//stores の読み取りを行う

const FAMILIES_COLLECTION = 'families';

const STORES_COLLECTION = 'stores';

//ドキュメントIDを含めた店舗
export type StoreWithId = { id: string } & StoreDoc;

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
  return onSnapshot(
    query(storesCollectionRef(familyId), orderBy('createdTime', 'desc')),
    snapshot => {
      const stores = snapshot.docs.map(document => ({
        id: document.id,
        ...(document.data() as StoreDoc),
      }));
      callback(stores);
    },
    error => {
      console.warn(`observeStores failed: ${familyId}`, error);
      onError?.(error);
    },
  );
}

//各店舗の変化を監視する
export function observeStore(
  familyId: string,
  storeId: string,
  callback: (store: StoreWithId | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    storeDocRef(familyId, storeId),
    snapshot => {
      callback(
        snapshot.exists() ? { id: snapshot.id, ...(snapshot.data() as StoreDoc) } : null,
      );
    },
    error => {
      console.warn(`observeStore failed: ${familyId}/${storeId}`, error);
      onError?.(error);
    },
  );
}