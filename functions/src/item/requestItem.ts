import { onCall, HttpsError } from "firebase-functions/https";
import {
  DocumentData, DocumentReference, FieldValue, Transaction,
} from "firebase-admin/firestore";
import { runItemTransaction } from "../lib/itemTransaction";
import { importantRequestLimit } from "../lib/level";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 不足品を依頼品へ切り替える
export const requestItem = onCall(async (request) => {
  const isImportant = request.data?.isImportant ?? false;
  if (typeof isImportant !== "boolean") {
    throw new HttpsError(
      "invalid-argument",
      "isImportant は真偽値で指定してください。"
    );
  }

  const { itemId } = await runItemTransaction(
    request,
    "完了した品目は依頼できません。",
    ({ tx, uid, familyRef, itemRef, item, member }) => {
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

      if (isImportant) {
        useImportantRequest(
          tx, familyRef.collection("members").doc(uid), member
        );
      }

      tx.update(itemRef, {
        requestedTime: FieldValue.serverTimestamp(),
        requesterUserId: uid,
        isImportant,
      });
    }
  );

  return { itemId };
});

// 依頼品の上限を確認する
function useImportantRequest(
  tx: Transaction,
  memberRef: DocumentReference,
  member: DocumentData
): void {
  const limit = importantRequestLimit(Number(member.level ?? 1));
  if (limit < 1) {
    throw new HttpsError("permission-denied", "レベルが足りません。");
  }

  const today = todayJst();
  const count = member.importantRequestDate === today ?
    Number(member.importantRequestCount ?? 0) :
    0;
  if (count >= limit) {
    throw new HttpsError("resource-exhausted", "本日の上限に達しました。");
  }

  tx.update(memberRef, {
    importantRequestDate: today,
    importantRequestCount: count + 1,
  });
}

// 日付の取得
function todayJst(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}
