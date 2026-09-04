import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue } from "firebase-admin/firestore";
import { runItemTransactionFor } from "../lib/itemTransaction";
import { NotifiedItem, notifyRequesters } from "../lib/notify";
import {
  isStringArray, requireAuth, requireString, withItemId,
} from "../lib/request";

// 購入を報告して依頼を完了させる
export const reportPurchase = onCall(async (request) => {
  const uid = requireAuth(request);
  const familyId = requireString(request.data?.familyId, "familyId");
  const itemIds = request.data?.itemIds;
  if (!isStringArray(itemIds) || itemIds.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "itemIds は1件以上の文字列の配列で指定してください。"
    );
  }

  const reported: NotifiedItem[] = [];
  let reporterName = "";
  let failure: { itemId: string; error: unknown } | null = null;

  // 品目ごとに報告する
  for (const itemId of itemIds) {
    try {
      await runItemTransactionFor(
        uid,
        familyId,
        itemId,
        "既に完了した品目です。",
        async ({ tx, item, member, familyRef, itemRef, assignmentId }) => {
          await completeItem(tx, item, familyRef, itemRef, assignmentId);
          reporterName = String(member.displayName ?? "");
          reported.push({
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

  await notifyRequesters(familyId, uid, reported, {
    title: "依頼品が購入されました",
    single: (itemName) => `${reporterName}さんが「${itemName}」を購入しました`,
    multiple: (count) => `${reporterName}さんが${count}件の依頼品を購入しました`,
  });

  if (failure !== null) {
    throw withItemId(failure.error, failure.itemId);
  }

  return { itemIds: reported.map((entry) => entry.itemId) };
});

// 品目を完了状態にする
async function completeItem(
  tx: FirebaseFirestore.Transaction,
  item: FirebaseFirestore.DocumentData,
  familyRef: FirebaseFirestore.DocumentReference,
  itemRef: FirebaseFirestore.DocumentReference,
  assignmentId: string
): Promise<void> {
  // 報告できるのは自分が担当している品目だけ
  if (item.activeAssignmentId !== assignmentId) {
    throw new HttpsError(
      "failed-precondition",
      "この品目を担当していません。"
    );
  }

  const assignmentRef = familyRef.collection("assignments").doc(assignmentId);
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
