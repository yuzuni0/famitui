import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// 担当を辞退する機能
export const cancelAssignment = onCall(
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

    const assignmentId = `${itemId}_${uid}`;

    await db.runTransaction(async (tx) => {
      const familyRef = db.collection("families").doc(familyId);
      const memberRef = familyRef.collection("members").doc(uid);
      const itemRef = familyRef.collection("items").doc(itemId);
      const assignmentRef = familyRef
        .collection("assignments")
        .doc(assignmentId);

      // 読み取りを行う
      const memberSnapshot = await tx.get(memberRef);
      const itemSnapshot = await tx.get(itemRef);
      const assignmentSnapshot = await tx.get(assignmentRef);

      if (!memberSnapshot.exists) {
        throw new HttpsError(
          "permission-denied",
          "この家族グループに所属していません。"
        );
      }

      // item を取得して確認する
      const item = itemSnapshot.data();
      if (!item) {
        throw new HttpsError("not-found", "品目が見つかりません。");
      }

      if (item.status === "completed") {
        throw new HttpsError(
          "failed-precondition",
          "既に完了した品目です。"
        );
      }

      // 自分が担当している品目だけ辞退できる
      if (item.activeAssignmentId !== assignmentId) {
        throw new HttpsError(
          "failed-precondition",
          "この品目を担当していません。"
        );
      }

      const assignment = assignmentSnapshot.data();
      if (!assignment || assignment.status !== "active") {
        throw new HttpsError(
          "failed-precondition",
          "担当中の割り当てがありません。"
        );
      }

      // 書き込みを行う
      tx.update(assignmentRef, {
        status: "canceled",
      });

      // 外れた依頼の状態を更新する
      tx.update(itemRef, {
        activeAssignmentId: null,
        rejectedUserIds: FieldValue.arrayUnion(uid),
      });
    });

    return { itemId };
  }
);
