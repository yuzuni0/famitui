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
  let previousLevel: number | null = null;
  let newLevel = 1;
  let addedScore = 0;
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

          // スコアとレベルを更新する
          const scoreBefore = Number(member.score ?? 0);
          const score = scoreBefore + scoreDelta;
          const level = levelForScore(score);
          tx.update(familyRef.collection("members").doc(uid), { score, level });

          previousLevel ??= levelForScore(scoreBefore);
          newLevel = level;
          addedScore += scoreDelta;
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
  if (previousLevel !== null && newLevel > previousLevel) {
    await sendPushToMember(
      familyId,
      uid,
      "レベルアップ",
      `レベル${newLevel}になりました`,
      { kind: "levelUp", level: newLevel }
    );
  }

  if (failure !== null) {
    throw withItemId(failure.error, failure.itemId);
  }

  return {
    itemIds: reported.map((entry) => entry.itemId),
    previousLevel: previousLevel ?? newLevel,
    newLevel,
    addedScore,
  };
});

// 品目を完了状態にする
async function completeItem(
  tx: FirebaseFirestore.Transaction,
  item: FirebaseFirestore.DocumentData,
  familyRef: FirebaseFirestore.DocumentReference,
  itemRef: FirebaseFirestore.DocumentReference,
  assignmentId: string
): Promise<number> {
  const assignmentsRef = familyRef.collection("assignments");
  const activeAssignmentId: string | null = item.activeAssignmentId ?? null;

  let expiredAssignmentId: string | null = null;
  if (activeAssignmentId !== null && activeAssignmentId !== assignmentId) {
    const otherSnapshot = await tx.get(assignmentsRef.doc(activeAssignmentId));
    const other = otherSnapshot.data();
    if (other && other.status === "active") {
      const expireTime = other.expireTime as Timestamp | null;
      const isExpired =
        expireTime === null || expireTime.toMillis() <= Date.now();
      if (!isExpired) {
        throw new HttpsError("failed-precondition", "他の人が担当中です。");
      }
      expiredAssignmentId = activeAssignmentId;
    }
  }

  const assignmentRef = assignmentsRef.doc(assignmentId);
  const assignmentSnapshot = await tx.get(assignmentRef);
  const assignment = assignmentSnapshot.data();
  const isMine =
    activeAssignmentId === assignmentId &&
    assignment !== undefined &&
    assignment.status === "active";

  // 書き込みを行う
  if (expiredAssignmentId !== null) {
    tx.update(assignmentsRef.doc(expiredAssignmentId), { status: "expired" });
  }

  if (isMine) {
    tx.update(assignmentRef, {
      status: "completed",
      completedTime: FieldValue.serverTimestamp(),
      reportMethod: "manual",
    });
  } else {
    // 担当していない不足品は、報告と同時に担当して完了させる
    tx.set(assignmentRef, {
      itemId: itemRef.id,
      assigneeUserId: assignmentId.slice(itemRef.id.length + 1),
      status: "completed",
      approvedTime: FieldValue.serverTimestamp(),
      expireTime: Timestamp.now(),
      completedTime: FieldValue.serverTimestamp(),
      reportMethod: "manual",
    });
  }

  tx.update(itemRef, {
    status: "completed",
    completedTime: FieldValue.serverTimestamp(),
    activeAssignmentId: null,
    assignmentExpireTime: null,
  });

  return scoreForPurchase(item, isMine ? assignment : null);
}

// 購入報告に合わせてスコアを計算する
function scoreForPurchase(
  item: FirebaseFirestore.DocumentData,
  assignment: FirebaseFirestore.DocumentData | null
): number {
  const base = (item.requesterUserId ?? null) !== null ?
    SCORE_REQUESTED_PURCHASE :
    SCORE_UNREQUESTED_PURCHASE;

  const approvedTime =
    assignment === null ? null : (assignment.approvedTime as Timestamp | null);
  const isPrompt =
    approvedTime !== null &&
    Date.now() - approvedTime.toMillis() <= PROMPT_BONUS_WINDOW_MS;

  return base + (isPrompt ? SCORE_PROMPT_BONUS : 0);
}
