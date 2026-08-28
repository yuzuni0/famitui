import { collection, deleteDoc, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, } from '@react-native-firebase/firestore';
import type { CategoryId, GeoPoint, StoreDoc } from '../types/firestore';
//storeId の読み書きを行う

const FAMILIES_COLLECTION = 'families';

const STORES_COLLECTION = 'stores';

//ドキュメントIDを含めた店舗
export type StoreWithId = { id: string } & StoreDoc;

//店舗の登録時に受け取る情報
export type CreateStoreInput = {
  //識別子
  sourceId: string;
  storeName: string;
  location: GeoPoint;
  address: string | null;
  //省略時のから配列
  categories?: CategoryId[];
};

//店舗の更新時に受け取る情報
export type UpdateStoreInput = Partial<Pick<StoreDoc, 'storeName' | 'categories'>>;

//stores への参照を行う
function storesCollectionRef(familyId: string) {
  return collection(getFirestore(), FAMILIES_COLLECTION, familyId, STORES_COLLECTION);
}

function storeDocRef(familyId: string, storeId: string) {
  return doc(getFirestore(), FAMILIES_COLLECTION, familyId, STORES_COLLECTION, storeId);
}

//購入場所を指定する店舗を登録する
export async function createStore(
  familyId: string,
  uid: string,
  input: CreateStoreInput,
): Promise<string> {
  await setDoc(storeDocRef(familyId, input.sourceId), {
    storeName: input.storeName,
    location: input.location,
    address: input.address,
    categories: input.categories ?? [],
    sourceId: input.sourceId,
    creatorUserId: uid,
    createdTime: serverTimestamp(),
  });
  return input.sourceId;
}

//店舗名とカテゴリを更新する
export async function updateStore(
  familyId: string,
  storeId: string,
  input: UpdateStoreInput,
): Promise<void> {
  await updateDoc(storeDocRef(familyId, storeId), { ...input });
}

//店舗を削除する
export async function deleteStore(familyId: string, storeId: string): Promise<void> {
  await deleteDoc(storeDocRef(familyId, storeId));
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