import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// 依頼を拒否して以後の通知対象から外れる
export const rejectRequest = onCall(
  { region: "asia-northeast1" },
  async (request) => {
    // 呼び出し元の確認を行う
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }
    const uid = request.auth.uid;

    const familyId = request.data?.familyId;
    if (typeof familyId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "familyId は文字列で指定してください。"
      );
    }

    const itemId = request.data?.itemId;
    if (typeof itemId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "itemId は文字列で指定してください。"
      );
    }

    const db = getFirestore();

    // assignmentId を生成する
    const assignmentId = `${itemId}_${uid}`;

    await db.runTransaction(async (tx) => {
      const familyRef = db.collection("families").doc(familyId);
      const memberRef = familyRef.collection("members").doc(uid);
      const itemRef = familyRef.collection("items").doc(itemId);

      // 読み取りを行う
      const memberSnapshot = await tx.get(memberRef);
      const itemSnapshot = await tx.get(itemRef);

      if (!memberSnapshot.exists) {
        throw new HttpsError(
          "permission-denied",
          "この家族グループに所属していません。"
        );
      }

      // item を確認する
      const item = itemSnapshot.data();
      if (!item) {
        throw new HttpsError("not-found", "品目が見つかりません。");
      }

      if (item.status === "completed") {
        throw new HttpsError(
          "failed-precondition",
          "完了した品目は拒否できません。"
        );
      }

      if (item.requesterUserId === null) {
        throw new HttpsError(
          "failed-precondition",
          "依頼が出ている品目だけを拒否できます。"
        );
      }

      // 自分が承認した依頼を取りやめにする
      if (item.activeAssignmentId === assignmentId) {
        throw new HttpsError(
          "failed-precondition",
          "承認済みの依頼は拒否できません。"
        );
      }

      // 既に拒否してる
      tx.update(itemRef, {
        rejectedUserIds: FieldValue.arrayUnion(uid),
      });
    });

    return { itemId };
  }
);
