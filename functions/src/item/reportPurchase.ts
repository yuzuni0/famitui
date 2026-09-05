import { onCall, HttpsError } from "firebase-functions/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { runItemTransactionFor } from "../lib/itemTransaction";
import {
  PROMPT_BONUS_WINDOW_MS,
  SCORE_PROMPT_BONUS,
  SCORE_REQUESTED_PURCHASE,
  SCORE_UNREQUESTED_PURCHASE,
  levelForScore,
} from "../lib/level";
import {
  NotifiedItem,
  notifyRequesters,
  sendPushToMember,
} from "../lib/notify";
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
  let levelBefore: number | null = null;
  let levelAfter = 1;
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
          const scoreDelta = await completeItem(
            tx, item, familyRef, itemRef, assignmentId
          );

          // スコアとレベルの更新を行う
          const score = Number(member.score ?? 0) + scoreDelta;
          const level = levelForScore(score);
          tx.update(familyRef.collection("members").doc(uid), { score, level });

          levelBefore ??= Number(member.level ?? 1);
          levelAfter = level;
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

  // レベルが上がったら通知する
  if (levelBefore !== null && levelAfter > levelBefore) {
    await sendPushToMember(
      familyId,
      uid,
      "レベルアップ",
      `レベル${levelAfter}になりました`,
      { kind: "levelUp", level: levelAfter }
    );
  }

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
): Promise<number> {
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

  return scoreForPurchase(item, assignment);
}

// 購入報告に合わせてスコアを計算する
function scoreForPurchase(
  item: FirebaseFirestore.DocumentData,
  assignment: FirebaseFirestore.DocumentData
): number {
  const base = (item.requesterUserId ?? null) !== null ?
    SCORE_REQUESTED_PURCHASE :
    SCORE_UNREQUESTED_PURCHASE;

  const approvedTime = assignment.approvedTime as Timestamp | null;
  const isPrompt =
    approvedTime !== null &&
    Date.now() - approvedTime.toMillis() <= PROMPT_BONUS_WINDOW_MS;

  return base + (isPrompt ? SCORE_PROMPT_BONUS : 0);
}
