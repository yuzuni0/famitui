import { HttpsError } from "firebase-functions/https";
import { DocumentData, FieldValue } from "firebase-admin/firestore";

// ユーザーの所属を確認する
export function requireUnaffiliatedUser(
  user: DocumentData | undefined
): DocumentData {
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

  return user;
}

// 初期値
export function initialMemberData(displayName: unknown): DocumentData {
  return {
    displayName,
    joinedTime: FieldValue.serverTimestamp(),
    transportMode: "none",
    transportModeManualDate: null,
    busyUntilTime: null,
    busyLabel: null,
    level: 1,
    score: 0,
    importantRequestDate: null,
    importantRequestCount: 0,
  };
}
