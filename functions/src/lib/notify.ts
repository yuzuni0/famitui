import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions/v2";
// トークンが失効した際の処理
const TOKEN_NOT_REGISTERED = "messaging/registration-token-not-registered";

const APPROVAL_CHANNEL_ID = "approval";

// 指定のメンバーへ通知を送る
export async function sendPushToMember(
  familyId: string,
  uid: string,
  title: string,
  body: string,
  data?: Record<string, string>
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
      data: data ?? {},
      android: {
        priority: "high",
        notification: { channelId: APPROVAL_CHANNEL_ID },
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

function isTokenNotRegistered(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    (error as { code?: unknown }).code === TOKEN_NOT_REGISTERED;
}
