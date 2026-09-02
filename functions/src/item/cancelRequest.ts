import { onCall, HttpsError } from "firebase-functions/https";
import { runItemTransaction } from "../lib/itemTransaction";

// 依頼品を不足品へ戻す
export const cancelRequest = onCall(async (request) => {
  const { itemId } = await runItemTransaction(
    request,
    "完了した品目の依頼は取り下げられません。",
    ({ tx, itemRef, item }) => {
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
    }
  );

  return { itemId };
});
