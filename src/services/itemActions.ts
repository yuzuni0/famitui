import { callFunction } from './functionsClient';

//品目の状態を変える Cloud Functions を呼び出す

type ItemActionRequest = {
  familyId: string;
  itemId: string;
};

//不足品を依頼品へ切り替える
export async function requestItem(
  familyId: string,
  itemId: string,
  isImportant = false,
): Promise<void> {
  await callFunction<ItemActionRequest & { isImportant: boolean }, { itemId: string | null }>(
    'requestItem',
    { familyId, itemId, isImportant },
  );
}

//依頼品を不足品へ戻す
export async function cancelRequestItem(familyId: string, itemId: string): Promise<void> {
  await callFunction<ItemActionRequest, { itemId: string | null }>('cancelRequest', {
    familyId,
    itemId,
  });
}

//依頼を承認して自分を担当者にする
export async function approveRequest(familyId: string, itemIds: string[]): Promise<void> {
  await callFunction<{ familyId: string; itemIds: string[] }, { itemIds: string[] }>(
    'approveRequest',
    { familyId, itemIds },
  );
}

//失敗した品目のIDを取得する
export function failedItemId(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('details' in error)) {
    return null;
  }
  const details = (error as { details: unknown }).details;
  if (typeof details !== 'object' || details === null || !('itemId' in details)) {
    return null;
  }
  const itemId = (details as { itemId: unknown }).itemId;
  return typeof itemId === 'string' ? itemId : null;
}

//購入を報告して依頼を完了させる
export async function reportPurchase(familyId: string, itemIds: string[]): Promise<void> {
  await callFunction<{ familyId: string; itemIds: string[] }, { itemIds: string[] }>(
    'reportPurchase',
    { familyId, itemIds },
  );
}

//担当を辞退して依頼品へ戻す
export async function cancelAssignment(familyId: string, itemId: string): Promise<void> {
  await callFunction<ItemActionRequest, { itemId: string }>('cancelAssignment', {
    familyId,
    itemId,
  });
}