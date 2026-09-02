import { CallableRequest, HttpsError } from "firebase-functions/https";
import {
  DocumentData,
  DocumentReference,
  Transaction,
  getFirestore,
} from "firebase-admin/firestore";
import { requireAuth, requireString } from "./request";

export type ItemTransactionContext = {
  tx: Transaction;
  uid: string;
  itemId: string;
  familyRef: DocumentReference;
  itemRef: DocumentReference;
  item: DocumentData;
  assignmentId: string;
};

// 品目を操作する
export async function runItemTransaction(
  request: CallableRequest,
  completedMessage: string,
  handler: (context: ItemTransactionContext) => void | Promise<void>
): Promise<{ itemId: string; assignmentId: string }> {
  const uid = requireAuth(request);
  const familyId = requireString(request.data?.familyId, "familyId");
  const itemId = requireString(request.data?.itemId, "itemId");
  const assignmentId = `${itemId}_${uid}`;

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const familyRef = db.collection("families").doc(familyId);
    const itemRef = familyRef.collection("items").doc(itemId);

    // 書き込み前に読み取りを行う
    const memberSnapshot = await tx.get(
      familyRef.collection("members").doc(uid)
    );
    const itemSnapshot = await tx.get(itemRef);

    if (!memberSnapshot.exists) {
      throw new HttpsError(
        "permission-denied",
        "この家族グループに所属していません。"
      );
    }

    const item = itemSnapshot.data();
    if (!item) {
      throw new HttpsError("not-found", "品目が見つかりません。");
    }

    if (item.status === "completed") {
      throw new HttpsError("failed-precondition", completedMessage);
    }

    await handler({ tx, uid, itemId, familyRef, itemRef, item, assignmentId });
  });

  return { itemId, assignmentId };
}
