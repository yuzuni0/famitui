//Firebaseのエラーコードを日本語に変換する処理

//Firebase のエラーコードを取得する
export function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

export type ErrorScope =
  | 'requestItem'
  | 'cancelRequestItem'
  | 'approveRequest'
  | 'reportPurchase'
  | 'cancelAssignment'
  | 'detectItems'
  | 'getRoute';

//呼び出し元ごとに共通の文言を上書きする
const SCOPE_MESSAGES: Record<ErrorScope, Partial<Record<string, string | null>>> = {
  requestItem: {
    //所属状況とレベル状態でエラーを変える
    'permission-denied': null,
    'not-found': '品目が見つかりません。',
    'failed-precondition': '既に依頼が出ているか、担当が決まっています。',
  },
  cancelRequestItem: {
    'permission-denied': null,
    'not-found': '品目が見つかりません。',
    'failed-precondition': '依頼が出ていないか、既に担当が決まっています。',
  },
  approveRequest: {
    'permission-denied': 'この家族グループに所属していません。',
    'not-found': '品目が見つかりません。',
    'failed-precondition': '他の人が担当を始めたか、完了しています。',
  },
  reportPurchase: {
    'permission-denied': 'この家族グループに所属していません。',
    'not-found': '品目が見つかりません。',
    'failed-precondition': '担当していないか、既に完了しています。',
  },
  cancelAssignment: {
    'permission-denied': 'この家族グループに所属していません。',
    'not-found': '品目が見つかりません。',
    'failed-precondition': 'この品目を担当していないか、既に完了しています。',
  },
  detectItems: {
    'permission-denied': 'この家族グループに所属していません。',
    'not-found': '撮影した画像が見つかりません。',
    'internal': '判定に失敗しました。時間をおいてもう一度お試しください。',
    'deadline-exceeded': '判定に時間がかかりすぎました。もう一度お試しください。',
  },
  getRoute: {
    'permission-denied': 'この家族グループに所属していません。',
    'not-found': '経路が見つかりませんでした。',
    'internal': '経路の取得に失敗しました。時間をおいてもう一度お試しください。',
  },
};

//エラーコードを日本語のメッセージに変換する
export function errorMessage(error: unknown, scope?: ErrorScope): string {
  const code = errorCode(error);

  //呼び出し元の文言があればそれを使う
  if (scope !== undefined && code !== null) {
    const scopedMessage = SCOPE_MESSAGES[scope][code];
    if (scopedMessage === null) {
      return error instanceof Error ? error.message : String(error);
    }
    if (scopedMessage !== undefined) {
      return scopedMessage;
    }
  }

  switch (code) {
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

    //Cloud Firestore のエラーコード
    //Rules に拒否された場合に返る
    case 'permission-denied':
    case 'firestore/permission-denied':
      return 'この操作を行う権限がありません。';

    default:
      return error instanceof Error ? error.message : String(error);
  }
}