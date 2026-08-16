import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// 招待コードの形式（英大文字と数字の6桁）
const INVITE_CODE_PATTERN = /^[A-Z0-9]{6}$/;

// 招待コードを使って既存の家族グループに参加し、familyId を返す
export const joinFamily = onCall(async (request) => {
  // 呼び出し元の確認を行う
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  const uid = request.auth.uid;

  const rawInviteCode = request.data?.inviteCode;
  if (typeof rawInviteCode !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "inviteCode は文字列で指定してください。"
    );
  }

  // 小文字を大文字に変換してから検証する
  const inviteCode = rawInviteCode.trim().toUpperCase();
  if (!INVITE_CODE_PATTERN.test(inviteCode)) {
    throw new HttpsError(
      "invalid-argument",
      "招待コードは英大文字と数字の6桁で入力してください。"
    );
  }

  // トランザクションでの書き込み
  const db = getFirestore();
  const familyId = await db.runTransaction(async (tx) => {
    const inviteCodeRef = db.collection("inviteCodes").doc(inviteCode);
    const userRef = db.collection("users").doc(uid);

    // 書き込みより前に全ての読み取りを終える
    const inviteCodeSnapshot = await tx.get(inviteCodeRef);
    const userSnapshot = await tx.get(userRef);

    // 招待コードの存在を確認し、familyId を取得する
    const invite = inviteCodeSnapshot.data();
    if (!invite) {
      throw new HttpsError("not-found", "招待コードが見つかりません。");
    }
    const joinFamilyId = invite.familyId;
    if (typeof joinFamilyId !== "string") {
      throw new HttpsError("not-found", "招待コードが見つかりません。");
    }

    // ユーザー情報を検証し、displayName を取得する
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

    const familyRef = db.collection("families").doc(joinFamilyId);
    const memberRef = familyRef.collection("members").doc(uid);

    // familyId をここで読み取る
    const memberSnapshot = await tx.get(memberRef);

    if (!memberSnapshot.exists) {
      tx.create(
        memberRef,
        {
          displayName: user.displayName,
          joinedTime: FieldValue.serverTimestamp(),
          transportMode: "none",
          transportModeExpireTime: null,
          busyUntilTime: null,
          busyLabel: null,
          level: 1,
          score: 0,
        }
      );
    }

    // {uid} の familyId を更新する
    tx.update(userRef, { familyId: joinFamilyId });

    return joinFamilyId;
  });

  return { familyId };
});
