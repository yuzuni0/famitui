import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore } from "firebase-admin/firestore";

// 依頼品を不足品へ戻す
export const cancelRequest = onCall(
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

    await db.runTransaction(async (tx) => {
      const familyRef = db.collection("families").doc(familyId);
      const memberRef = familyRef.collection("members").doc(uid);
      const itemRef = familyRef.collection("items").doc(itemId);

      // まず読み取りを行う
      const memberSnapshot = await tx.get(memberRef);
      const itemSnapshot = await tx.get(itemRef);

      if (!memberSnapshot.exists) {
        throw new HttpsError(
          "permission-denied",
          "この家族グループに所属していません。"
        );
      }

      // item の存在を確認する
      const item = itemSnapshot.data();
      if (!item) {
        throw new HttpsError("not-found", "品目が見つかりません。");
      }

      if (item.status === "completed") {
        throw new HttpsError(
          "failed-precondition",
          "完了した品目の依頼は取り下げられません。"
        );
      }

      // 依頼が出ていない品目は取り下げられない
      if (item.requesterUserId === null) {
        throw new HttpsError(
          "failed-precondition",
          "依頼が出ている品目だけを取り下げられます。"
        );
      }

      // 承認済みの依頼は取り下げられない
      if (item.activeAssignmentId !== null) {
        throw new HttpsError(
          "failed-precondition",
          "既に担当が決まっているため取り下げられません。"
        );
      }

      // status は変えずに依頼が付いていない状態へ戻す
      tx.update(itemRef, {
        requestedTime: null,
        requesterUserId: null,
        rejectedUserIds: [],
      });
    });

    return { itemId };
  }
);
