import { doc, getFirestore, updateDoc } from '@react-native-firebase/firestore';
import type { FamilyDoc, GeoPoint } from '../types/firestore';
import { callFunction } from './functionsClient';
import { observeDocData } from './observe';

// Functions の関数名

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

//familyidの参照を返す
function familyDocRef(familyId: string) {
  return doc(getFirestore(), 'families', familyId);
}

//家族グループを新規作成する
export async function createFamily(familyName: string): Promise<CreateFamilyResult> {
  return callFunction<{ familyName: string }, CreateFamilyResult>('createFamily', {
    familyName,
  });
}

//招待コードで既存の家族グループに参加する
export async function joinFamily(inviteCode: string): Promise<JoinFamilyResult> {
  return callFunction<{ inviteCode: string }, JoinFamilyResult>('joinFamily', { inviteCode });
}

//families/{familyId} の変化を監視する
export function observeFamilyDoc(
  familyId: string,
  callback: (family: FamilyDoc | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return observeDocData<FamilyDoc>(
    familyDocRef(familyId),
    `observeFamilyDoc failed: ${familyId}`,
    callback,
    onError,
  );
}

//自宅の位置を更新する
export async function updateHomeLocation(familyId: string, location: GeoPoint): Promise<void> {
  await updateDoc(familyDocRef(familyId), { homeLocation: location });
}