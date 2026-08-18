import { addDoc, collection, deleteDoc, doc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, updateDoc, } from '@react-native-firebase/firestore';
import type { CategoryId, ItemDoc, ItemStatus } from '../types/firestore';
//items/{itemId} の読み書きを行う

const FAMILIES_COLLECTION = 'families';

const ITEMS_COLLECTION = 'items';

//ドキュメントIDを含めた不足品
export type ItemWithId = { id: string } & ItemDoc;

//利用者が入力する内容を持つ
export type CreateItemInput = {
  itemName: string;
  category: CategoryId;
  alternativeItemNames: string[];

  maxDistanceMeters: number | null;
  note: string;
  autoNotifyEnabled: boolean;
};

export type UpdateItemInput = Partial<CreateItemInput>;

//items への参照を行う
function itemsCollectionRef(familyId: string) {
  return collection(getFirestore(), FAMILIES_COLLECTION, familyId, ITEMS_COLLECTION);
}

//items/{itemId} への参照を行う
function itemDocRef(familyId: string, itemId: string) {
  return doc(getFirestore(), FAMILIES_COLLECTION, familyId, ITEMS_COLLECTION, itemId);
}

//不足品を新規作成する
export async function createItem(
  familyId: string,
  uid: string,
  input: CreateItemInput,
): Promise<string> {
  const ref = await addDoc(itemsCollectionRef(familyId), {
    //利用者が入力するもの
    itemName: input.itemName,
    category: input.category,
    alternativeItemNames: input.alternativeItemNames,
    maxDistanceMeters: input.maxDistanceMeters,
    note: input.note,
    autoNotifyEnabled: input.autoNotifyEnabled,
    //関数が設定するもの
    status: 'shortage',
    creatorUserId: uid,
    createdTime: serverTimestamp(),
    //初期値で固定するもの
    requestedTime: null,
    requesterUserId: null,
    completedTime: null,
    activeAssignmentId: null,
    rejectedUserIds: [],
  });
  return ref.id;
}

//不足品の内容のみを更新する
export async function updateItem(
  familyId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<void> {
  await updateDoc(itemDocRef(familyId, itemId), { ...input });
}

//不足品を削除する
export async function deleteItem(familyId: string, itemId: string): Promise<void> {
  await deleteDoc(itemDocRef(familyId, itemId));
}

//表示順を決めるための状態の優先度を示す
const STATUS_ORDER: Record<ItemStatus, number> = {
  requested: 0,
  shortage: 1,
  completed: 2,
};

function createdTimeMillis(item: ItemWithId): number {
  return item.createdTime ? item.createdTime.toMillis() : Number.MAX_SAFE_INTEGER;
}

//一覧の表示順に並べ替える
export function sortItems(items: ItemWithId[]): ItemWithId[] {
  return [...items].sort((a, b) => {
    const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDiff !== 0) {
      return statusDiff;
    }
    return createdTimeMillis(b) - createdTimeMillis(a);
  });
}

//不足品の変化を監視する
export function observeItems(
  familyId: string,
  callback: (items: ItemWithId[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(itemsCollectionRef(familyId), orderBy('createdTime', 'desc')),
    snapshot => {
      const items = snapshot.docs.map(document => ({
        id: document.id,
        ...(document.data() as ItemDoc),
      }));
      callback(sortItems(items));
    },
    error => {
      console.warn(`observeItems failed: ${familyId}`, error);
      onError?.(error);
    },
  );
}
