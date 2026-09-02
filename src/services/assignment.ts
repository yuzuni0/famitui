import { collection, doc, getFirestore, query, where } from '@react-native-firebase/firestore';
import type { AssignmentDoc } from '../types/firestore';
import { observeCollection, observeDoc } from './observe';
import type { WithId } from './observe';
//assignments の読み取りを行う

const FAMILIES_COLLECTION = 'families';

const ASSIGNMENTS_COLLECTION = 'assignments';

//ドキュメントIDの割り当て
export type AssignmentWithId = WithId<AssignmentDoc>;

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

//残り時間を示す
export function remainingLabel(assignment: AssignmentDoc): string {
  if (isExpired(assignment)) {
    return '期限切れ';
  }

  const minutes = Math.floor(remainingMillis(assignment) / 60000);
  return minutes < 1 ? 'まもなく期限' : `残り${minutes}分`;
}

//自分が担当している割り当ての変化を監視する
export function observeMyAssignments(
  familyId: string,
  uid: string,
  callback: (assignments: AssignmentWithId[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeCollection<AssignmentDoc>(
    query(
      assignmentsCollectionRef(familyId),
      where('assigneeUserId', '==', uid),
      where('status', '==', 'active'),
    ),
    `observeMyAssignments failed: ${familyId}/${uid}`,
    callback,
    onError,
  );
}

//割り当て変化を監視する
export function observeAssignment(
  familyId: string,
  assignmentId: string,
  callback: (assignment: AssignmentWithId | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeDoc<AssignmentDoc>(
    assignmentDocRef(familyId, assignmentId),
    `observeAssignment failed: ${familyId}/${assignmentId}`,
    callback,
    onError,
  );
}