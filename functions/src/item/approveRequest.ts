import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { runItemTransactionFor } from "../lib/itemTransaction";
import { sendPushToMember } from "../lib/notify";
import { isStringArray, requireAuth, requireString } from "../lib/request";

const ASSIGNMENT_DURATION_MS = 30 * 60 * 1000;

// 承諾した品目
type ApprovedItem = {
  itemId: string;
  itemName: string;
  requesterUserId: string | null;
};

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

  const approved: ApprovedItem[] = [];
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

  await notifyRequesters(familyId, uid, approverName, approved);

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

// 依頼者ごとにまとめて通知する
async function notifyRequesters(
  familyId: string,
  approverUid: string,
  approverName: string,
  approved: ApprovedItem[]
): Promise<void> {
  const byRequester = new Map<string, ApprovedItem[]>();
  for (const entry of approved) {
    const requesterUserId = entry.requesterUserId;
    if (requesterUserId === null || requesterUserId === approverUid) {
      continue;
    }
    const list = byRequester.get(requesterUserId) ?? [];
    list.push(entry);
    byRequester.set(requesterUserId, list);
  }

  for (const [requesterUserId, entries] of byRequester) {
    const body = entries.length === 1 ?
      `${approverName}さんが「${entries[0].itemName}」を担当します` :
      `${approverName}さんが${entries.length}件の依頼を担当します`;
    const data = entries.length === 1 ?
      { itemId: entries[0].itemId } :
      { itemIds: entries.map((entry) => entry.itemId) };

    await sendPushToMember(
      familyId,
      requesterUserId,
      "依頼が承諾されました",
      body,
      data
    );
  }
}

// エラーに品目のIDを付与する
function withItemId(error: unknown, itemId: string): HttpsError {
  if (error instanceof HttpsError) {
    return new HttpsError(error.code, error.message, { itemId });
  }
  return new HttpsError("internal", "処理に失敗しました。", { itemId });
}
