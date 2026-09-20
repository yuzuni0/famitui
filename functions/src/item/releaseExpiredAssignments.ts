import { onSchedule } from "firebase-functions/scheduler";
import { logger } from "firebase-functions/v2";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

// 期限切れの担当を解除する
export const releaseExpiredAssignments = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Asia/Tokyo" },
  async () => {
    const db = getFirestore();
    const threshold = Timestamp.now();

    const snapshot = await db
      .collectionGroup("assignments")
      .where("status", "==", "active")
      .where("expireTime", "<=", threshold)
      .get();

    let released = 0;
    for (const assignmentDoc of snapshot.docs) {
      const familyRef = assignmentDoc.ref.parent.parent;
      if (familyRef === null) {
        continue;
      }

      await db.runTransaction(async (tx) => {
        const assignmentSnapshot = await tx.get(assignmentDoc.ref);
        const assignment = assignmentSnapshot.data();
        if (!assignment || assignment.status !== "active") {
          return;
        }

        const itemRef = familyRef
          .collection("items")
          .doc(String(assignment.itemId));
        const itemSnapshot = await tx.get(itemRef);

        tx.update(assignmentDoc.ref, { status: "expired" });

        if (
          itemSnapshot.exists &&
          itemSnapshot.data()?.activeAssignmentId === assignmentDoc.id
        ) {
          tx.update(itemRef, {
            activeAssignmentId: null,
            assignmentExpireTime: null,
          });
        }
        released += 1;
      });
    }

    logger.info("releaseExpiredAssignments", {
      matched: snapshot.size,
      released,
    });
  }
);
