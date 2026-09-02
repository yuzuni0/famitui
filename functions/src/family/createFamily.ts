import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { issueUniqueInviteCode } from "../lib/inviteCode";
import { initialMemberData, requireUnaffiliatedUser } from "../lib/member";
import { requireAuth, requireString } from "../lib/request";

// 家族名の文字数の範囲
const FAMILY_NAME_MIN_LENGTH = 1;
const FAMILY_NAME_MAX_LENGTH = 20;

// 家族グループを新規作成し、familyId と招待コードを返す
export const createFamily = onCall(async (request) => {
  const uid = requireAuth(request);

  const familyName =
    requireString(request.data?.familyName, "familyName").trim();

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

  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const userRef = db.collection("users").doc(uid);

    // 書き込みより前に全ての読み取りを終える
    const userSnapshot = await tx.get(userRef);
    const inviteCodeRef = await issueUniqueInviteCode(db, tx);

    const user = requireUnaffiliatedUser(userSnapshot.data());

    const familyRef = db.collection("families").doc();

    tx.create(familyRef, {
      familyName,
      inviteCode: inviteCodeRef.id,
      creatorUserId: uid,
      createdTime: FieldValue.serverTimestamp(),
      // 家の位置
      homeLocation: null,
    });

    tx.create(
      familyRef.collection("members").doc(uid),
      initialMemberData(user.displayName)
    );

    tx.create(inviteCodeRef, {
      familyId: familyRef.id,
      creatorUserId: uid,
      createdTime: FieldValue.serverTimestamp(),
    });

    tx.update(userRef, { familyId: familyRef.id });

    return { familyId: familyRef.id, inviteCode: inviteCodeRef.id };
  });
});
