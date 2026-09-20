import { callFunction } from './functionsClient';

export type CreateFamilyResult = {
  familyId: string;
  inviteCode: string;
};

export type JoinFamilyResult = {
  familyId: string;
};

//家族グループの新規作成
export async function createFamily(familyName: string): Promise<CreateFamilyResult> {
  return callFunction<{ familyName: string }, CreateFamilyResult>('createFamily', {
    familyName,
  });
}

//家族グループの参加
export async function joinFamily(inviteCode: string): Promise<JoinFamilyResult> {
  return callFunction<{ inviteCode: string }, JoinFamilyResult>('joinFamily', { inviteCode });
}