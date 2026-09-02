import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue } from "firebase-admin/firestore";
import { runItemTransaction } from "../lib/itemTransaction";

// 不足品を依頼品へ切り替える
export const requestItem = onCall(async (request) => {
  const { itemId } = await runItemTransaction(
    request,
    "完了した品目は依頼できません。",
    ({ tx, uid, itemRef, item }) => {
      // 既に依頼が出ている品の状態と編集は行えない
      if (item.requesterUserId !== null) {
        throw new HttpsError("failed-precondition", "既に依頼が出ています。");
      }

      if (item.activeAssignmentId !== null) {
        throw new HttpsError(
          "failed-precondition",
          "既に担当が決まっています。"
        );
      }

      tx.update(itemRef, {
        requestedTime: FieldValue.serverTimestamp(),
        requesterUserId: uid,
      });
    }
  );

  return { itemId };
});
