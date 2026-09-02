import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue } from "firebase-admin/firestore";
import { runItemTransaction } from "../lib/itemTransaction";

// 依頼を拒否して以後の通知対象から外れる
export const rejectRequest = onCall(async (request) => {
  const { itemId } = await runItemTransaction(
    request,
    "完了した品目は拒否できません。",
    ({ tx, uid, itemRef, item, assignmentId }) => {
      if (item.requesterUserId === null) {
        throw new HttpsError(
          "failed-precondition",
          "依頼が出ている品目だけを拒否できます。"
        );
      }

      // 自分が承認した依頼は拒否できない
      if (item.activeAssignmentId === assignmentId) {
        throw new HttpsError(
          "failed-precondition",
          "承認済みの依頼は拒否できません。"
        );
      }

      tx.update(itemRef, {
        rejectedUserIds: FieldValue.arrayUnion(uid),
      });
    }
  );

  return { itemId };
});
