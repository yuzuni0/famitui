import { randomInt } from "node:crypto";
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/https";

// 招待コードに使う文字
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// 招待コードの桁数
const CODE_LENGTH = 6;

// 再生成を行う上限
const MAX_ATTEMPTS = 10;

// 招待コードを格納するコレクション
const INVITE_CODES_COLLECTION = "inviteCodes";


// CODE_LENGTH 桁の招待コードをランダムに生成する。
export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[randomInt(0, CODE_CHARS.length)];
  }
  return code;
}

// 既存の招待コードと被ったとき、MAX_ATTEMPTS 回まで再生成を行う
export async function issueUniqueInviteCode(
  db: Firestore,
  tx: Transaction
): Promise<DocumentReference> {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const inviteCodeRef = db
      .collection(INVITE_CODES_COLLECTION)
      .doc(generateInviteCode());
    const snapshot = await tx.get(inviteCodeRef);

    if (!snapshot.exists) {
      return inviteCodeRef;
    }
  }

  throw new HttpsError(
    "internal",
    "招待コードの生成に失敗しました。時間をおいて再試行してください。"
  );
}
