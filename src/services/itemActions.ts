import { callFunction } from './functionsClient';

//品目の状態を変える Cloud Functions を呼び出す

type ItemActionRequest = {
  familyId: string;
  itemId: string;
};

//不足品を依頼品へ切り替える
export async function requestItem(familyId: string, itemId: string): Promise<void> {
  await callFunction<ItemActionRequest, { itemId: string | null }>('requestItem', {
    familyId,
    itemId,
  });
}

//依頼品を不足品へ戻す
export async function cancelRequestItem(familyId: string, itemId: string): Promise<void> {
  await callFunction<ItemActionRequest, { itemId: string | null }>('cancelRequest', {
    familyId,
    itemId,
  });
}

//依頼を承認して自分を担当者にする
export async function approveRequest(familyId: string, itemId: string): Promise<string> {
  const result = await callFunction<ItemActionRequest, { assignmentId: string }>(
    'approveRequest',
    { familyId, itemId },
  );
  return result.assignmentId;
}

//購入を報告して依頼を完了させる
export async function reportPurchase(familyId: string, itemId: string): Promise<void> {
  await callFunction<ItemActionRequest, { itemId: string }>('reportPurchase', {
    familyId,
    itemId,
  });
}

//担当を辞退して依頼品へ戻す
export async function cancelAssignment(familyId: string, itemId: string): Promise<void> {
  await callFunction<ItemActionRequest, { itemId: string }>('cancelAssignment', {
    familyId,
    itemId,
  });
}