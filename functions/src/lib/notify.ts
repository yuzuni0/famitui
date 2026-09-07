import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
// トークンが失効した際の処理
const TOKEN_NOT_REGISTERED = "messaging/registration-token-not-registered";

const APPROVAL_CHANNEL_ID = "approval";
const CHAT_CHANNEL_ID = "chat";

// 承諾通知に載せる値
type ApprovalData = { itemId: string } | { itemIds: string[] };

// チャットの通知の値
export type ChatData = {
  kind: "chat";
  familyId: string;
  assignmentId: string;
  messageId: string;
  itemName: string;
  partnerUserId: string;
};

// レベル上昇の通知の値
export type PushData =
  | ({ kind: "approval" } & ApprovalData)
  | { kind: "levelUp"; level: number }
  | ChatData;

// 指定のメンバーへ送る
export async function sendPushToMember(
  familyId: string,
  uid: string,
  title: string,
  body: string,
  data: PushData
): Promise<void> {
  const memberRef = getFirestore()
    .collection("families").doc(familyId)
    .collection("members").doc(uid);
  const memberSnapshot = await memberRef.get();
  const token = memberSnapshot.data()?.fcmToken;

  if (typeof token !== "string" || token.length === 0) {
    logger.info("通知用トークンが未登録のため送信しません", { familyId, uid });
    return;
  }

  try {
    await getMessaging().send({
      token,
      notification: { title, body },
      data: toFcmData(data),
      android: {
        priority: "high",
        notification: {
          channelId: data.kind === "chat" ?
            CHAT_CHANNEL_ID : APPROVAL_CHANNEL_ID,
          tag: notificationTag(data),
        },
      },
    });
  } catch (error) {
    logger.warn("通知の送信に失敗しました", { familyId, uid, error });

    // 失効したトークンを消す
    if (isTokenNotRegistered(error)) {
      await memberRef.update({ fcmToken: null });
    }
  }
}

// 依頼者へ通知する品目
export type NotifiedItem = {
  itemId: string;
  itemName: string;
  requesterUserId: string | null;
};

// 件数に応じた通知
export type NotifyText = {
  title: string;
  single: (itemName: string) => string;
  multiple: (count: number) => string;
};

// 依頼者ごとに通知を送る
export async function notifyRequesters(
  familyId: string,
  senderUid: string,
  entries: NotifiedItem[],
  text: NotifyText
): Promise<void> {
  const byRequester = new Map<string, NotifiedItem[]>();
  for (const entry of entries) {
    const requesterUserId = entry.requesterUserId;
    if (requesterUserId === null || requesterUserId === senderUid) {
      continue;
    }
    const list = byRequester.get(requesterUserId) ?? [];
    list.push(entry);
    byRequester.set(requesterUserId, list);
  }

  for (const [requesterUserId, list] of byRequester) {
    const body = list.length === 1 ?
      text.single(list[0].itemName) :
      text.multiple(list.length);
    const data: PushData = list.length === 1 ?
      { kind: "approval", itemId: list[0].itemId } :
      { kind: "approval", itemIds: list.map((entry) => entry.itemId) };

    await sendPushToMember(familyId, requesterUserId, text.title, body, data);
  }
}

// 通知のタグを生成する
function notificationTag(data: PushData): string {
  if (data.kind === "chat") {
    return `chat_${data.assignmentId}_${data.messageId}`;
  }
  return `${data.kind}_${tagId(data)}_${Date.now()}`;
}

function tagId(data: PushData): string {
  if ("itemId" in data) {
    return data.itemId;
  }
  if ("itemIds" in data) {
    return data.itemIds[0] ?? "";
  }
  if ("level" in data) {
    return String(data.level);
  }
  return "";
}

// オブジェクトをJSON文字列に変換する
function toFcmData(data: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) =>
      [key, typeof value === "string" ? value : JSON.stringify(value)]
    )
  );
}

function isTokenNotRegistered(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    (error as { code?: unknown }).code === TOKEN_NOT_REGISTERED;
}
