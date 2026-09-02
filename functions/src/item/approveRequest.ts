import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { runItemTransaction } from "../lib/itemTransaction";

const ASSIGNMENT_DURATION_MS = 30 * 60 * 1000;

// 依頼を承認して担当者を決める
export const approveRequest = onCall(async (request) => {
  const { assignmentId } = await runItemTransaction(
    request,
    "完了した品目は担当できません。",
    async ({ tx, uid, itemId, familyRef, itemRef, item, assignmentId }) => {
      const assignmentsRef = familyRef.collection("assignments");

      // 既に担当が決まっていないかを確認する
      const activeAssignmentId: string | null = item.activeAssignmentId ?? null;
      let expiredAssignmentId: string | null = null;

      if (activeAssignmentId !== null) {
        const activeAssignmentSnapshot = await tx.get(
          assignmentsRef.doc(activeAssignmentId)
        );
        const activeAssignment = activeAssignmentSnapshot.data();

        if (activeAssignment && activeAssignment.status === "active") {
          const expireTime = activeAssignment.expireTime as Timestamp | null;
          const isExpired =
            expireTime === null || expireTime.toMillis() <= Date.now();

          if (!isExpired) {
            throw new HttpsError(
              "failed-precondition",
              "他の人が担当中です。"
            );
          }

          // 期限切れの割り当ては expired へ移す
          expiredAssignmentId = activeAssignmentId;
        }
      }

      // ここから書き込みを行う
      if (
        expiredAssignmentId !== null &&
        expiredAssignmentId !== assignmentId
      ) {
        tx.update(assignmentsRef.doc(expiredAssignmentId), {
          status: "expired",
        });
      }

      // 上書きされるのは自分自身の過去の割り当てのみである
      tx.set(assignmentsRef.doc(assignmentId), {
        itemId,
        assigneeUserId: uid,
        status: "active",
        approvedTime: FieldValue.serverTimestamp(),

        expireTime: Timestamp.fromMillis(Date.now() + ASSIGNMENT_DURATION_MS),
        completedTime: null,
        reportMethod: null,
      });

      tx.update(itemRef, {
        activeAssignmentId: assignmentId,
      });
    }
  );

  return { assignmentId };
});
