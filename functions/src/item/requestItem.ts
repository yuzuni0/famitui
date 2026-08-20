import { onCall, HttpsError } from "firebase-functions/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// 不足品を依頼品へ切り替える
export const requestItem = onCall(async (request) => {
  // 呼び出し元の確認を行う
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

  // トランザクションの書き込み
  const db = getFirestore();

  await db.runTransaction(async (tx) => {
    const familyRef = db.collection("families").doc(familyId);
    const memberRef = familyRef.collection("members").doc(uid);
    const itemRef = familyRef.collection("items").doc(itemId);

    // 書き込み前に読み取りを行う
    const memberSnapshot = await tx.get(memberRef);
    const itemSnapshot = await tx.get(itemRef);

    if (!memberSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "この家族グループに所属していません。"
      );
    }

    // item の存在を確認する
    const item = itemSnapshot.data();
    if (!item) {
      throw new HttpsError("not-found", "品目が見つかりません。");
    }

    if (item.status === "completed") {
      throw new HttpsError(
        "failed-precondition",
        "完了した品目は依頼できません。"
      );
    }

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

    tx.update(itemRef, {
      requestedTime: FieldValue.serverTimestamp(),
      requesterUserId: uid,
    });
  });

  return { itemId };
});
