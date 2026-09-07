import { onDocumentCreated } from "firebase-functions/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { sendPushToMember } from "../lib/notify";

const MESSAGE_PATH =
  "families/{familyId}/assignments/{assignmentId}/messages/{messageId}";

// メッセージテキストを整える
function bodyFor(message: FirebaseFirestore.DocumentData): string {
  const proposalValue = String(message.proposalValue ?? "");
  switch (message.messageType) {
  case "alternativeProposal":
    return `代替品の提案: ${proposalValue}`;
  case "timeChangeProposal":
    return `購入時間の変更: ${proposalValue}`;
  default:
    return String(message.bodyText ?? "");
  }
}

// メッセージの通知を取得する
export const onMessageCreated = onDocumentCreated(
  {
    document: MESSAGE_PATH,
    region: "asia-northeast1",
  },
  async (event) => {
    const message = event.data?.data();
    if (message === undefined) {
      return;
    }

    const { familyId, assignmentId, messageId } = event.params;
    const senderUserId = message.senderUserId;
    if (typeof senderUserId !== "string") {
      logger.warn("senderUserId が不正です", { familyId, assignmentId, messageId });
      return;
    }

    const familyRef = getFirestore().collection("families").doc(familyId);

    // 担当者と品目を取得
    const assignmentSnapshot = await familyRef
      .collection("assignments").doc(assignmentId).get();
    const assignment = assignmentSnapshot.data();
    if (assignment === undefined) {
      logger.warn("割り当てが見つかりません", { familyId, assignmentId });
      return;
    }
    const assigneeUserId: string | null = assignment.assigneeUserId ?? null;
    const itemId = assignment.itemId;
    if (typeof itemId !== "string") {
      logger.warn("itemId が不正です", { familyId, assignmentId });
      return;
    }

    // 依頼者と品目名を調べる
    const itemSnapshot = await familyRef.collection("items").doc(itemId).get();
    const item = itemSnapshot.data();
    if (item === undefined) {
      logger.warn("品目が見つかりません", { familyId, itemId });
      return;
    }
    const requesterUserId: string | null = item.requesterUserId ?? null;
    const itemName = String(item.itemName ?? "");

    // 送信先の指定
    let recipientUserId: string | null = null;
    if (assigneeUserId !== null && assigneeUserId !== senderUserId) {
      recipientUserId = assigneeUserId;
    } else if (requesterUserId !== null && requesterUserId !== senderUserId) {
      recipientUserId = requesterUserId;
    }
    if (recipientUserId === null) {
      logger.info("通知先がないため送信しません", {
        familyId, assignmentId, senderUserId,
      });
      return;
    }

    // 送信者の表示名を取得
    const senderSnapshot = await familyRef
      .collection("members").doc(senderUserId).get();
    const senderDisplayName = String(senderSnapshot.data()?.displayName ?? "");

    // 通知先のトークン確認を行う
    await sendPushToMember(
      familyId,
      recipientUserId,
      `${itemName}：${senderDisplayName}`,
      bodyFor(message),
      {
        kind: "chat",
        familyId,
        assignmentId,
        messageId,
        itemName,
        partnerUserId: senderUserId,
      }
    );
  }
);
