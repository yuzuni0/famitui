import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue } from "firebase-admin/firestore";
import { runItemTransaction } from "../lib/itemTransaction";
import { sendPushToMember } from "../lib/notify";

// 担当を辞退する機能
export const cancelAssignment = onCall(async (request) => {
  let familyId = "";
  let itemName = "";
  let cancelerName = "";
  let requesterUserId: string | null = null;

  const { itemId } = await runItemTransaction(
    request,
    "既に完了した品目です。",
    async ({ tx, uid, familyRef, itemRef, item, member, assignmentId }) => {
      // 自分が担当している品目だけ辞退できる
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
        status: "canceled",
      });

      // 外れた依頼の状態を更新する
      tx.update(itemRef, {
        activeAssignmentId: null,
        assignmentExpireTime: null,
        rejectedUserIds: FieldValue.arrayUnion(uid),
      });

      familyId = familyRef.id;
      itemName = String(item.itemName ?? "");
      cancelerName = String(member.displayName ?? "");
      requesterUserId =
        item.requesterUserId === uid ? null : item.requesterUserId ?? null;
    }
  );

  // 依頼者に辞退通知を送る
  if (requesterUserId !== null) {
    await sendPushToMember(
      familyId,
      requesterUserId,
      "担当が辞退されました",
      `${cancelerName}さんが「${itemName}」の担当を辞退しました`,
      { kind: "approval", itemId }
    );
  }

  return { itemId };
});
