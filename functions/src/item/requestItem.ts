import { onCall, HttpsError } from "firebase-functions/https";
import {
  DocumentData, DocumentReference, FieldValue, Transaction,
} from "firebase-admin/firestore";
import { isCategoryId } from "../lib/categories";
import { runItemTransaction } from "../lib/itemTransaction";
import {
  CATEGORY_UNLOCK_LEVEL,
  canRequestCategory,
  importantRequestLimit,
  todayJst,
} from "../lib/level";

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

      requireRequestableCategory(member, item);

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

// 依頼可能なカテゴリかを判断する
function requireRequestableCategory(
  member: DocumentData,
  item: DocumentData
): void {
  const category = item.category;
  if (!isCategoryId(category)) {
    throw new HttpsError(
      "failed-precondition",
      "品目のカテゴリが不正です。"
    );
  }

  const level = Number(member.level ?? 1);
  if (!canRequestCategory(level, category)) {
    throw new HttpsError(
      "permission-denied",
      `このカテゴリはレベル${CATEGORY_UNLOCK_LEVEL[category]}から依頼できます。`
    );
  }
}

// 依頼品の上限を確認する
function useImportantRequest(
  tx: Transaction,
  memberRef: DocumentReference,
  member: DocumentData
): void {
  const limit = importantRequestLimit(Number(member.level ?? 1));
  if (limit < 1) {
    throw new HttpsError(
      "permission-denied",
      "重要な依頼はレベル3から使えます。"
    );
  }

  const today = todayJst();
  const count = member.importantRequestDate === today ?
    Number(member.importantRequestCount ?? 0) :
    0;
  if (count >= limit) {
    throw new HttpsError(
      "resource-exhausted",
      "本日の重要な依頼の上限に達しました。"
    );
  }

  tx.update(memberRef, {
    importantRequestDate: today,
    importantRequestCount: count + 1,
  });
}
