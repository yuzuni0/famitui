import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut as authSignOut } from '@react-native-firebase/auth';

//Firebase Authenticationを扱う

//メールとパスワードでアカウントを作成し、ログイン状態にする
export async function signUp(email: string, password: string): Promise<string> {
  const credential = await createUserWithEmailAndPassword(getAuth(), email, password);
  return credential.user.uid;
}

//メールとパスワードでログインする
export async function signIn(email: string, password: string): Promise<string> {
  const credential = await signInWithEmailAndPassword(getAuth(), email, password);
  return credential.user.uid;
}

//ログアウトする
export async function signOut(): Promise<void> {
  await authSignOut(getAuth());
}

//現在ログインしているユーザーの uid を返す
//未ログインの場合は null を返す
export function getCurrentUid(): string | null {
  return getAuth().currentUser?.uid ?? null;
}

//ログイン状態の変化を監視する
export function observeAuthState(callback: (uid: string | null) => void): () => void {
  return onAuthStateChanged(getAuth(), user => {
    callback(user?.uid ?? null);
  });
}