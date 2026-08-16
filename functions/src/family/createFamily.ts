import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { issueUniqueInviteCode } from "../lib/inviteCode";

// 家族名の文字数の範囲
const FAMILY_NAME_MIN_LENGTH = 1;
const FAMILY_NAME_MAX_LENGTH = 20;

// 家族グループを新規作成し、familyId と招待コードを返す
export const createFamily = onCall(async (request) => {
  // 呼び出し元の確認を行う
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  const uid = request.auth.uid;

  const rawFamilyName = request.data?.familyName;
  if (typeof rawFamilyName !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "familyName は文字列で指定してください。"
    );
  }

  const familyName = rawFamilyName.trim();

  const familyNameLength = [...familyName].length;
  if (
    familyNameLength < FAMILY_NAME_MIN_LENGTH ||
    familyNameLength > FAMILY_NAME_MAX_LENGTH
  ) {
    throw new HttpsError(
      "invalid-argument",
      `家族名は${FAMILY_NAME_MIN_LENGTH}〜${FAMILY_NAME_MAX_LENGTH}文字で入力してください。`
    );
  }

  // トランザクションでの書き込み
  const db = getFirestore();

  const result = await db.runTransaction(async (tx) => {
    // ユーザー情報の取得( uid の familyId )
    const userRef = db.collection("users").doc(uid);

    // 書き込みより前に全ての読み取りを終える
    const userSnapshot = await tx.get(userRef);
    const inviteCodeRef = await issueUniqueInviteCode(db, tx);

    // ドキュメントが存在しない場合、undefined を返す
    const user = userSnapshot.data();
    if (!user) {
      throw new HttpsError(
        "failed-precondition",
        "ユーザー情報が登録されていません。"
      );
    }

    if (typeof user.familyId === "string") {
      throw new HttpsError(
        "failed-precondition",
        "既に家族グループに所属しています。"
      );
    }

    // familyId を生成する
    const familyRef = db.collection("families").doc();

    // {familyId} を作成する

    tx.create(familyRef, {
      familyName,
      inviteCode: inviteCodeRef.id,
      creatorUserId: uid,
      createdTime: FieldValue.serverTimestamp(),
    });

    // {uid}を作成する
    tx.create(familyRef.collection("members").doc(uid), {
      displayName: user.displayName,
      joinedTime: FieldValue.serverTimestamp(),
      transportMode: "none",
      transportModeExpireTime: null,
      busyUntilTime: null,
      busyLabel: null,
      level: 1,
      score: 0,
    });

    // {inviteCode}を作成する
    tx.create(inviteCodeRef, {
      familyId: familyRef.id,
      creatorUserId: uid,
      createdTime: FieldValue.serverTimestamp(),
    });

    // {uid} の familyId を更新する
    tx.update(userRef, { familyId: familyRef.id });

    return { familyId: familyRef.id, inviteCode: inviteCodeRef.id };
  });

  // 画面で招待コードを表示する
  return result;
});
