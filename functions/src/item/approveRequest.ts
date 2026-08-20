import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

const ASSIGNMENT_DURATION_MS = 30 * 60 * 1000;

// 依頼を承認して担当者を決める
export const approveRequest = onCall(
  { region: "asia-northeast1" },
  async (request) => {
    // 呼び出し元の確認を
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインが必要です。");
    }
    const uid = request.auth.uid;

    const familyId = request.data?.familyId;
    if (typeof familyId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "familyId は文字列で指定してください。"
      );
    }

    const itemId = request.data?.itemId;
    if (typeof itemId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "itemId は文字列で指定してください。"
      );
    }

    const db = getFirestore();

    // 同じ人が同じ品目を承認すると必ず同じIDになる
    const assignmentId = `${itemId}_${uid}`;

    await db.runTransaction(async (tx) => {
      const familyRef = db.collection("families").doc(familyId);
      const memberRef = familyRef.collection("members").doc(uid);
      const itemRef = familyRef.collection("items").doc(itemId);
      const assignmentRef = familyRef
        .collection("assignments")
        .doc(assignmentId);

      // まず読み取りを行う
      const memberSnapshot = await tx.get(memberRef);
      const itemSnapshot = await tx.get(itemRef);

      if (!memberSnapshot.exists) {
        throw new HttpsError(
          "permission-denied",
          "この家族グループに所属していません。"
        );
      }

      // item があるかを確認する
      const item = itemSnapshot.data();
      if (!item) {
        throw new HttpsError("not-found", "品目が見つかりません。");
      }

      if (item.status === "completed") {
        throw new HttpsError(
          "failed-precondition",
          "完了した品目は担当できません。"
        );
      }

      // 既に担当が決まっていないかを確認する
      const activeAssignmentId: string | null = item.activeAssignmentId ?? null;
      let expiredAssignmentId: string | null = null;

      if (activeAssignmentId !== null) {
        const activeAssignmentRef = familyRef
          .collection("assignments")
          .doc(activeAssignmentId);
        const activeAssignmentSnapshot = await tx.get(activeAssignmentRef);
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
        tx.update(
          familyRef.collection("assignments").doc(expiredAssignmentId),
          { status: "expired" }
        );
      }

      // 上書きされるのは自分自身の過去の割り当てのみである
      tx.set(assignmentRef, {
        itemId,
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
    });

    return { assignmentId };
  }
);
