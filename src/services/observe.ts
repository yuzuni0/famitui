import { onSnapshot } from '@react-native-firebase/firestore';
import type { DocumentData, DocumentReference, Query } from '@react-native-firebase/firestore';

export type WithId<T> = { id: string } & T;

//コレクションの監視
export function observeCollection<T extends DocumentData>(
  target: Query<DocumentData>,
  label: string,
  callback: (docs: WithId<T>[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    target,
    snapshot => {
      callback(
        snapshot.docs.map(document => ({ id: document.id, ...(document.data() as T) })),
      );
    },
    error => {
      console.warn(label, error);
      onError?.(error);
    },
  );
}

//ドキュメントの監視
export function observeDoc<T extends DocumentData>(
  target: DocumentReference<DocumentData>,
  label: string,
  callback: (doc: WithId<T> | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    target,
    snapshot => {
      callback(snapshot.exists() ? { id: snapshot.id, ...(snapshot.data() as T) } : null);
    },
    error => {
      console.warn(label, error);
      onError?.(error);
    },
  );
}

//ドキュメンとからデータを取得する
export function observeDocData<T extends DocumentData>(
  target: DocumentReference<DocumentData>,
  label: string,
  callback: (data: T | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    target,
    snapshot => {
      callback(snapshot.exists() ? (snapshot.data() as T) : null);
    },
    error => {
      console.warn(label, error);
      onError?.(error);
    },
  );
}