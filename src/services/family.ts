import { getApp } from '@react-native-firebase/app';
import { doc, getFirestore, onSnapshot, updateDoc } from '@react-native-firebase/firestore';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import type { FamilyDoc, GeoPoint } from '../types/firestore';
//家族グループの Cloud Functions の呼び出しと、 familyId の読み書きを行う

const REGION = 'asia-northeast1';

const FAMILIES_COLLECTION = 'families';

//CloudFunctions の関数名
const CREATE_FAMILY = 'createFamily';
const JOIN_FAMILY = 'joinFamily';

//createFamily に渡す引数
type CreateFamilyRequest = {
  familyName: string;
};

//joinFamily に渡す引数
type JoinFamilyRequest = {
  inviteCode: string;
};

//createFamily の戻り値
export type CreateFamilyResult = {
  familyId: string;
  //作成した家族グループの招待コード
  inviteCode: string;
};

//joinFamily の戻り値
export type JoinFamilyResult = {
  familyId: string;
};

//リージョンを指定した Functions インスタンスを返す
function familyFunctions() {
  return getFunctions(getApp(), REGION);
}

//familyidの参照を返す
function familyDocRef(familyId: string) {
  return doc(getFirestore(), FAMILIES_COLLECTION, familyId);
}

//家族グループを新規作成する
export async function createFamily(familyName: string): Promise<CreateFamilyResult> {
  const callable = httpsCallable<CreateFamilyRequest, CreateFamilyResult>(
    familyFunctions(),
    CREATE_FAMILY,
  );
  const result = await callable({ familyName });
  return result.data;
}

//招待コードで既存の家族グループに参加する
export async function joinFamily(inviteCode: string): Promise<JoinFamilyResult> {
  const callable = httpsCallable<JoinFamilyRequest, JoinFamilyResult>(
    familyFunctions(),
    JOIN_FAMILY,
  );
  const result = await callable({ inviteCode });
  return result.data;
}

//families/{familyId} の変化を監視する
export function observeFamilyDoc(
  familyId: string,
  callback: (family: FamilyDoc | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    familyDocRef(familyId),
    snapshot => {
      callback(snapshot.exists() ? (snapshot.data() as FamilyDoc) : null);
    },
    error => {
      console.warn(`observeFamilyDoc failed: ${familyId}`, error);
      onError?.(error);
    },
  );
}

//自宅の位置を更新する
export async function updateHomeLocation(familyId: string, location: GeoPoint): Promise<void> {
  await updateDoc(familyDocRef(familyId), { homeLocation: location });
}