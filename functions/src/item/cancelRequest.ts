import { onCall, HttpsError } from "firebase-functions/https";
import {
  DocumentData, DocumentReference, Transaction,
} from "firebase-admin/firestore";
import { runItemTransaction } from "../lib/itemTransaction";
import { todayJst } from "../lib/level";

// 依頼品を不足品へ戻す
export const cancelRequest = onCall(async (request) => {
  const { itemId } = await runItemTransaction(
    request,
    "完了した品目の依頼は取り下げられません。",
    ({ tx, uid, familyRef, itemRef, item, member }) => {
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

      // 重要な依頼の取り下げを制限する
      if (item.isImportant === true && item.requesterUserId !== uid) {
        throw new HttpsError(
          "permission-denied",
          "重要な依頼は依頼した本人だけが取り下げられます。"
        );
      }

      // 重要な依頼の回数を戻す
      if (item.isImportant === true) {
        restoreImportantRequest(
          tx, familyRef.collection("members").doc(uid), member
        );
      }

      // status は変えずに依頼が付いていない状態へ戻す
      tx.update(itemRef, {
        requestedTime: null,
        requesterUserId: null,
        isImportant: false,
        rejectedUserIds: [],
      });
    }
  );

  return { itemId };
});

// その日の依頼回数を戻す
function restoreImportantRequest(
  tx: Transaction,
  memberRef: DocumentReference,
  member: DocumentData
): void {
  const count = Number(member.importantRequestCount ?? 0);
  if (member.importantRequestDate !== todayJst() || count < 1) {
    return;
  }

  tx.update(memberRef, { importantRequestCount: count - 1 });
}
