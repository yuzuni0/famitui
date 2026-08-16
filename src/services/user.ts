import { doc, getDoc, getFirestore, onSnapshot, serverTimestamp, setDoc, updateDoc } from '@react-native-firebase/firestore';
import type { UserDoc } from '../types/firestore';
//users/{uid} の読み書きを行う

const USERS_COLLECTION = 'users';

//users/{uid} への参照を行う
function userDocRef(uid: string) {
  return doc(getFirestore(), USERS_COLLECTION, uid);
}

//users/{uid} を新規作成する
export async function createUserDoc(uid: string, displayName: string): Promise<void> {
  await setDoc(userDocRef(uid), {
    displayName,
    familyId: null,
    createdTime: serverTimestamp(),
  });
}

//users/{uid} を取得する
export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snapshot = await getDoc(userDocRef(uid));
  if (!snapshot.exists()) {
    return null;//ドキュメントがない時
  }
  return snapshot.data() as UserDoc;
}

//displayName を更新する
export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  await updateDoc(userDocRef(uid), { displayName });
}

//users/{uid} の監視結果
export type UserDocSnapshot =
  | { status: 'found'; user: UserDoc }
  | { status: 'missing' }
  | { status: 'unknown' };

//users/{uid} の変化を監視する
export function observeUserDoc(
  uid: string,
  callback: (snapshot: UserDocSnapshot) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    userDocRef(uid),
    snapshot => {
      if (snapshot.exists()) {
        callback({ status: 'found', user: snapshot.data() as UserDoc });
        return;
      }

      callback({ status: snapshot.metadata.fromCache ? 'unknown' : 'missing' });
    },
    error => {
      console.warn(`observeUserDoc failed: ${uid}`, error);
      onError?.(error);
    },
  );
}