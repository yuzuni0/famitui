import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue } from "firebase-admin/firestore";
import { runItemTransaction } from "../lib/itemTransaction";

// 購入を報告して依頼を完了させる
export const reportPurchase = onCall(async (request) => {
  const { itemId } = await runItemTransaction(
    request,
    "既に完了した品目です。",
    async ({ tx, familyRef, itemRef, item, assignmentId }) => {
      // 報告できるのは自分が担当している品目だけ
      if (item.activeAssignmentId !== assignmentId) {
        throw new HttpsError(
          "failed-precondition",
          "この品目を担当していません。"
        );
      }

      const assignmentRef = familyRef
        .collection("assignments")
        .doc(assignmentId);
      const assignmentSnapshot = await tx.get(assignmentRef);
      const assignment = assignmentSnapshot.data();
      if (!assignment || assignment.status !== "active") {
        throw new HttpsError(
          "failed-precondition",
          "担当中の割り当てがありません。"
        );
      }

      tx.update(assignmentRef, {
        status: "completed",
        completedTime: FieldValue.serverTimestamp(),
        reportMethod: "manual",
      });

      tx.update(itemRef, {
        status: "completed",
        completedTime: FieldValue.serverTimestamp(),
        activeAssignmentId: null,
      });
    }
  );

  return { itemId };
});
