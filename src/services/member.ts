import { collection, doc, getFirestore, orderBy, query, Timestamp, updateDoc, } from '@react-native-firebase/firestore';
import type { MemberDoc, TransportMode } from '../types/firestore';
import { observeCollection, observeDoc } from './observe';
import type { WithId } from './observe';
//members/{uid} の読み書きを行う

const FAMILIES_COLLECTION = 'families';

const MEMBERS_COLLECTION = 'members';

//移動手段を手動で設定した際の期限
const TRANSPORT_MODE_DURATION_MS = 3 * 60 * 60 * 1000;

export type MemberWithId = WithId<MemberDoc>;

export type UpdateMemberStatusInput = Partial<
  Pick<
    MemberDoc,
    'displayName' | 'transportMode' | 'transportModeExpireTime' | 'busyUntilTime' | 'busyLabel'
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

//移動手段の有効期限を計算する
export function transportModeExpireTime(mode: TransportMode): Timestamp | null {
  if (mode === 'none') {
    return null;
  }
  return Timestamp.fromDate(new Date(Date.now() + TRANSPORT_MODE_DURATION_MS));
}

//現在時刻から拘束終了時間を計算する
export function busyUntilTimeFromNow(durationMs: number): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() + durationMs));
}

//期限切れを考慮した移動手段を返す
export function resolveTransportMode(member: MemberDoc): TransportMode {
  if (member.transportMode === 'none') {
    return 'none';
  }
  if (member.transportModeExpireTime === null) {
    return member.transportMode;
  }
  if (member.transportModeExpireTime.toMillis() <= Date.now()) {
    return 'none';
  }
  return member.transportMode;
}

//拘束中であるかを返す
export function isBusy(member: MemberDoc): boolean {
  if (member.busyUntilTime === null) {
    return false;
  }
  return member.busyUntilTime.toMillis() > Date.now();
}

//移動手段と拘束状況を更新する
export async function updateMemberStatus(
  familyId: string,
  uid: string,
  input: UpdateMemberStatusInput,
): Promise<void> {
  await updateDoc(memberDocRef(familyId, uid), { ...input });
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