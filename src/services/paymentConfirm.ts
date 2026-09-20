import { clearLastPayment, getLastPayment } from '../../modules/paymentNotification';
import { fetchMyAssignments } from './firestore/assignment';
//決済通知から購入確認の判定を行う

const PAYMENT_CONFIRM_WINDOW_MS = 30 * 60 * 1000;

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

  const assignments = await fetchMyAssignments(familyId, uid);
  if (assignments.length === 0) {
    clearLastPayment();
    return false;
  }

  return true;
}