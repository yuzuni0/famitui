import * as Notifications from 'expo-notifications';
import { updateFcmToken } from '../firestore/member';
//通知用トークンの取得と保存を行う

//トークンを取得して members に保存する
export async function registerFcmToken(familyId: string, uid: string): Promise<void> {
  try {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    await updateFcmToken(familyId, uid, token);
  } catch (error) {
    console.warn(`registerFcmToken failed: ${familyId}/${uid}`, error);
  }
}