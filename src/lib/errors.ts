//Firebaseのエラーコードを日本語に変換する処理

//Firebase のエラーコードを取得する
export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

//エラーコードを日本語のメッセージに変換する
export function errorMessage(error: unknown): string {
  switch (errorCode(error)) {
    //Firebase Authentication のエラーコード
    case 'auth/email-already-in-use':
      return 'このメールアドレスは既に使われています。';
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません。';
    case 'auth/weak-password':
      return 'パスワードは6文字以上にしてください。';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'メールアドレスまたはパスワードが正しくありません。';
    case 'auth/network-request-failed':
      return '通信に失敗しました。';

    //Cloud Functions のエラーコード
    case 'unauthenticated':
      return 'ログインの状態が失われました。もう一度ログインしてください。';
    case 'invalid-argument':
      return '入力の形式が正しくありません。';
    case 'not-found':
      return '招待コードが見つかりません。';
    case 'failed-precondition':
      return '既に家族グループに所属しています。';
    case 'internal':
      return '処理に失敗しました。時間をおいてもう一度お試しください。';

    default:
      return error instanceof Error ? error.message : String(error);
  }
}