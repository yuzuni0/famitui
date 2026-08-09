import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
//家族グループの Cloud Functions の呼び出しを行う

const REGION = 'asia-northeast1';

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