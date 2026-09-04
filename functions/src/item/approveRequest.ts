import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { runItemTransactionFor } from "../lib/itemTransaction";
import { NotifiedItem, notifyRequesters } from "../lib/notify";
import {
  isStringArray, requireAuth, requireString, withItemId,
} from "../lib/request";

const ASSIGNMENT_DURATION_MS = 30 * 60 * 1000;

// 依頼を承認して担当者を決める
export const approveRequest = onCall(async (request) => {
  const uid = requireAuth(request);
  const familyId = requireString(request.data?.familyId, "familyId");
  const itemIds = request.data?.itemIds;
  if (!isStringArray(itemIds) || itemIds.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "itemIds は1件以上の文字列の配列で指定してください。"
    );
  }

  const approved: NotifiedItem[] = [];
  let approverName = "";
  let failure: { itemId: string; error: unknown } | null = null;

  // 品目ごとに承諾する
  for (const itemId of itemIds) {
    try {
      await runItemTransactionFor(
        uid,
        familyId,
        itemId,
        "完了した品目は担当できません。",
        async ({ tx, item, member, familyRef, itemRef, assignmentId }) => {
          await approveItem(tx, item, familyRef, itemRef, assignmentId, uid);
          approverName = String(member.displayName ?? "");
          approved.push({
            itemId,
            itemName: String(item.itemName ?? ""),
            requesterUserId: item.requesterUserId ?? null,
          });
        }
      );
    } catch (error) {
      failure = { itemId, error };
      break;
    }
  }

  await notifyRequesters(familyId, uid, approved, {
    title: "依頼が承諾されました",
    single: (itemName) => `${approverName}さんが「${itemName}」を担当します`,
    multiple: (count) => `${approverName}さんが${count}件の依頼を担当します`,
  });

  if (failure !== null) {
    throw withItemId(failure.error, failure.itemId);
  }

  return { itemIds: approved.map((entry) => entry.itemId) };
});

// 1品目を承諾する
async function approveItem(
  tx: FirebaseFirestore.Transaction,
  item: FirebaseFirestore.DocumentData,
  familyRef: FirebaseFirestore.DocumentReference,
  itemRef: FirebaseFirestore.DocumentReference,
  assignmentId: string,
  uid: string
): Promise<void> {
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
    itemId: itemRef.id,
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
