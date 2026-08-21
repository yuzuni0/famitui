import { collection, doc, getFirestore, onSnapshot, query, where, } from '@react-native-firebase/firestore';
import type { AssignmentDoc } from '../types/firestore';
//assignmentId の読み取りを行う

const FAMILIES_COLLECTION = 'families';

const ASSIGNMENTS_COLLECTION = 'assignments';

//ドキュメントIDの割り当て
export type AssignmentWithId = { id: string } & AssignmentDoc;

//assignments への参照を行う
function assignmentsCollectionRef(familyId: string) {
  return collection(getFirestore(), FAMILIES_COLLECTION, familyId, ASSIGNMENTS_COLLECTION);
}

function assignmentDocRef(familyId: string, assignmentId: string) {
  return doc(getFirestore(), FAMILIES_COLLECTION, familyId, ASSIGNMENTS_COLLECTION, assignmentId);
}

//期限切れかの判定
export function isExpired(assignment: AssignmentDoc): boolean {
  return assignment.expireTime.toMillis() <= Date.now();
}

export function remainingMillis(assignment: AssignmentDoc): number {
  const remaining = assignment.expireTime.toMillis() - Date.now();
  return remaining > 0 ? remaining : 0;
}

//自分が担当している割り当ての変化を監視する
export function observeMyAssignments(
  familyId: string,
  uid: string,
  callback: (assignments: AssignmentWithId[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    query(
      assignmentsCollectionRef(familyId),
      where('assigneeUserId', '==', uid),
      where('status', '==', 'active'),
    ),
    snapshot => {
      const assignments = snapshot.docs.map(document => ({
        id: document.id,
        ...(document.data() as AssignmentDoc),
      }));
      callback(assignments);
    },
    error => {
      console.warn(`observeMyAssignments failed: ${familyId}/${uid}`, error);
      onError?.(error);
    },
  );
}

//割り当て変化を監視する
export function observeAssignment(
  familyId: string,
  assignmentId: string,
  callback: (assignment: AssignmentWithId | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    assignmentDocRef(familyId, assignmentId),
    snapshot => {
      callback(
        snapshot.exists() ? { id: snapshot.id, ...(snapshot.data() as AssignmentDoc) } : null,
      );
    },
    error => {
      console.warn(`observeAssignment failed: ${familyId}/${assignmentId}`, error);
      onError?.(error);
    },
  );
}