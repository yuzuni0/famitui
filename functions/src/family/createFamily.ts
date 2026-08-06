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

  // 未使用の招待コードを取得する

  // トランザクション外から取得する
  const inviteCode = await issueUniqueInviteCode();

  // トランザクションでの書き込み
  const db = getFirestore();
  const familyId = await db.runTransaction(async (tx) => {
    // ユーザー情報の取得( uid の familyId )
    const userRef = db.collection("users").doc(uid);
    const userSnapshot = await tx.get(userRef);

    // ドキュメントが存在しない場合、undefined を返す
    const user = userSnapshot.data();
    if (!user) {
      throw new HttpsError(
        "failed-precondition",
        "ユーザー情報が登録されていません。"
      );
    }
    if (user.familyId !== null) {
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
    tx.create(db.collection("inviteCodes").doc(inviteCode), {
      familyId: familyRef.id,
      creatorUserId: uid,
      createdTime: FieldValue.serverTimestamp(),
    });

    // {uid} の familyId を更新する
    tx.update(userRef, { familyId: familyRef.id });

    return familyRef.id;
  });

  // 画面で招待コードを表示する
  return { familyId, inviteCode };
});
