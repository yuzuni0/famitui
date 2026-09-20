import { collection, doc, getFirestore, orderBy, query, Timestamp, updateDoc, writeBatch } from '@react-native-firebase/firestore';
import { todayJst } from '../../lib/level';
import type { MemberDoc } from '../../types/firestore';
import { FAMILIES_COLLECTION, observeCollection, observeDoc } from './observe';
import type { WithId } from './observe';
import { userDocRef } from './user';
//members/{uid} の読み書きを行う

const MEMBERS_COLLECTION = 'members';

export type MemberWithId = WithId<MemberDoc>;

export type UpdateMemberStatusInput = Partial<
  Pick<
    MemberDoc,
    'displayName' | 'transportMode' | 'transportModeManualDate' | 'busyUntilTime' | 'busyLabel'
  >
>;

//members への参照を行う
function membersCollectionRef(familyId: string) {
  return collection(getFirestore(), FAMILIES_COLLECTION, familyId, MEMBERS_COLLECTION);
}

//members/{uid} への参照を行う
function memberDocRef(familyId: string, uid: string) {
  return doc(getFirestore(), FAMILIES_COLLECTION, familyId, MEMBERS_COLLECTION, uid);
}

//現在時刻から予定終了時間を計算する
export function busyUntilTimeFromNow(durationMs: number): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() + durationMs));
}

export function isTransportModeManual(member: MemberDoc): boolean {
  return member.transportModeManualDate === todayJst();
}

//予定中であるかを返す
export function isBusy(member: MemberDoc): boolean {
  if (member.busyUntilTime === null) {
    return false;
  }
  return member.busyUntilTime.toMillis() > Date.now();
}

//移動手段と予定を更新する
export async function updateMemberStatus(
  familyId: string,
  uid: string,
  input: UpdateMemberStatusInput,
): Promise<void> {
  await updateDoc(memberDocRef(familyId, uid), { ...input });
}

//表示名を users と members の両方で更新する
export async function updateDisplayName(
  familyId: string,
  uid: string,
  displayName: string,
): Promise<void> {
  const batch = writeBatch(getFirestore());
  batch.update(userDocRef(uid), { displayName });
  batch.update(memberDocRef(familyId, uid), { displayName });
  await batch.commit();
}

//通知用トークンを更新する
export async function updateFcmToken(
  familyId: string,
  uid: string,
  token: string | null,
): Promise<void> {
  await updateDoc(memberDocRef(familyId, uid), { fcmToken: token });
}

//家族全員の変化を監視する
export function observeMembers(
  familyId: string,
  callback: (members: MemberWithId[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeCollection<MemberDoc>(
    query(membersCollectionRef(familyId), orderBy('joinedTime', 'asc')),
    `observeMembers failed: ${familyId}`,
    callback,
    onError,
  );
}

//特定の1人の変化を監視する
export function observeMember(
  familyId: string,
  uid: string,
  callback: (member: MemberWithId | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeDoc<MemberDoc>(
    memberDocRef(familyId, uid),
    `observeMember failed: ${familyId}/${uid}`,
    callback,
    onError,
  );
}