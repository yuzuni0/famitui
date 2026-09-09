import { collection, getDocs, getFirestore, query, where } from '@react-native-firebase/firestore';
import { clearLastPayment, getLastPayment } from '../../modules/paymentNotification';
import type { AssignmentDoc } from '../types/firestore';
import type { AssignmentWithId } from './assignment';
//決済通知を取得して購入確認の通知を送る

const FAMILIES_COLLECTION = 'families';

const ASSIGNMENTS_COLLECTION = 'assignments';

export const PAYMENT_CONFIRM_WINDOW_MS = 30 * 60 * 1000;

//自分が担当中の時に取得する
export async function findPendingAssignments(familyId: string, uid: string): Promise<AssignmentWithId[]> {
  const snapshot = await getDocs(
    query(
      collection(getFirestore(), FAMILIES_COLLECTION, familyId, ASSIGNMENTS_COLLECTION),
      where('assigneeUserId', '==', uid),
      where('status', '==', 'active'),
    ),
  );
  return snapshot.docs.map(document => ({ id: document.id, ...(document.data() as AssignmentDoc) }));
}

//購入確認を行うか
export async function shouldOpenPurchaseConfirm(familyId: string, uid: string): Promise<boolean> {
  const lastPayment = getLastPayment();
  if (lastPayment === null) {
    return false;
  }

  //古い決済を無視する
  if (Date.now() - lastPayment.time > PAYMENT_CONFIRM_WINDOW_MS) {
    clearLastPayment();
    return false;
  }

  const assignments = await findPendingAssignments(familyId, uid);
  if (assignments.length === 0) {
    clearLastPayment();
    return false;
  }

  return true;
}