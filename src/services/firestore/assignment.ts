import { collection, doc, getDocs, getFirestore, query, where } from '@react-native-firebase/firestore';
import type { AssignmentDoc } from '../../types/firestore';
import { FAMILIES_COLLECTION, observeCollection, observeDoc } from './observe';
import type { WithId } from './observe';
//assignments の読み取りを行う

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

//自分が担当の割り当てを取得する
function myAssignmentsQuery(familyId: string, uid: string) {
  return query(
    assignmentsCollectionRef(familyId),
    where('assigneeUserId', '==', uid),
    where('status', '==', 'active'),
  );
}

//期限切れかの判定
export function isExpired(assignment: AssignmentDoc): boolean {
  return assignment.expireTime.toMillis() <= Date.now();
}

//残り時間を示す
export function remainingLabel(assignment: AssignmentDoc): string {
  if (isExpired(assignment)) {
    return '期限切れ';
  }

  const minutes = Math.floor((assignment.expireTime.toMillis() - Date.now()) / 60000);
  return minutes < 1 ? 'まもなく期限' : `残り${minutes}分`;
}

//期限順に並べる
export function sortByExpireTime(assignments: AssignmentWithId[]): AssignmentWithId[] {
  return [...assignments].sort((a, b) => a.expireTime.toMillis() - b.expireTime.toMillis());
}

//自分が担当している割り当ての変化を監視する
export function observeMyAssignments(
  familyId: string,
  uid: string,
  callback: (assignments: AssignmentWithId[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeCollection<AssignmentDoc>(
    myAssignmentsQuery(familyId, uid),
    `observeMyAssignments failed: ${familyId}/${uid}`,
    callback,
    onError,
  );
}

//担当の割り当てを取得する
export async function fetchMyAssignments(
  familyId: string,
  uid: string,
): Promise<AssignmentWithId[]> {
  const snapshot = await getDocs(myAssignmentsQuery(familyId, uid));
  return snapshot.docs.map(document => ({
    id: document.id,
    ...(document.data() as AssignmentDoc),
  }));
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