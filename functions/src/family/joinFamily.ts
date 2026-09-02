import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore } from "firebase-admin/firestore";
import { initialMemberData, requireUnaffiliatedUser } from "../lib/member";
import { requireAuth, requireString } from "../lib/request";

// 招待コードの形式（英大文字と数字の6桁）
const INVITE_CODE_PATTERN = /^[A-Z0-9]{6}$/;

// 招待コードを使って既存の家族グループに参加し、familyId を返す
export const joinFamily = onCall(async (request) => {
  const uid = requireAuth(request);

  // 小文字を大文字に変換してから検証する
  const inviteCode = requireString(request.data?.inviteCode, "inviteCode")
    .trim()
    .toUpperCase();
  if (!INVITE_CODE_PATTERN.test(inviteCode)) {
    throw new HttpsError(
      "invalid-argument",
      "招待コードは英大文字と数字の6桁で入力してください。"
    );
  }

  const db = getFirestore();
  const familyId = await db.runTransaction(async (tx) => {
    const inviteCodeRef = db.collection("inviteCodes").doc(inviteCode);
    const userRef = db.collection("users").doc(uid);

    // 書き込みより前に全ての読み取りを終える
    const inviteCodeSnapshot = await tx.get(inviteCodeRef);
    const userSnapshot = await tx.get(userRef);

    // 招待コードの存在を確認し、familyId を取得する
    const joinFamilyId = inviteCodeSnapshot.data()?.familyId;
    if (typeof joinFamilyId !== "string") {
      throw new HttpsError("not-found", "招待コードが見つかりません。");
    }

    const user = requireUnaffiliatedUser(userSnapshot.data());

    const memberRef = db
      .collection("families")
      .doc(joinFamilyId)
      .collection("members")
      .doc(uid);
    const memberSnapshot = await tx.get(memberRef);

    if (!memberSnapshot.exists) {
      tx.create(memberRef, initialMemberData(user.displayName));
    }

    tx.update(userRef, { familyId: joinFamilyId });

    return joinFamilyId;
  });

  return { familyId };
});
