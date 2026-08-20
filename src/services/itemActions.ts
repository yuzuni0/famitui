import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
//品目の状態を変える Cloud Functions を呼び出す

const REGION = 'asia-northeast1';

const REQUEST_ITEM = 'requestItem';

const CANCEL_REQUEST_ITEM = 'cancelRequest';

const APPROVE_REQUEST = 'approveRequest';

//requestItem と cancelRequest に渡す引数
type RequestItemRequest = {
  familyId: string;
  itemId: string;
};

//requestItem と cancelRequest の戻り値
type RequestItemResult = {
  itemId: string | null;
};

//approveRequest の引数
type ApproveRequestRequest = {
  familyId: string;
  itemId: string;
};

//approveRequest の戻り値
type ApproveRequestResult = {
  assignmentId: string;
};

function itemFunctions() {
  return getFunctions(getApp(), REGION);
}

//不足品を依頼品へ切り替える
export async function requestItem(familyId: string, itemId: string): Promise<void> {
  const callable = httpsCallable<RequestItemRequest, RequestItemResult>(
    itemFunctions(),
    REQUEST_ITEM,
  );
  await callable({ familyId, itemId });
}

//依頼品を不足品へ戻す
export async function cancelRequestItem(familyId: string, itemId: string): Promise<void> {
  const callable = httpsCallable<RequestItemRequest, RequestItemResult>(
    itemFunctions(),
    CANCEL_REQUEST_ITEM,
  );
  await callable({ familyId, itemId });
}

//依頼を承認して自分を担当者にする
export async function approveRequest(familyId: string, itemId: string): Promise<string> {
  const callable = httpsCallable<ApproveRequestRequest, ApproveRequestResult>(
    itemFunctions(),
    APPROVE_REQUEST,
  );
  const response = await callable({ familyId, itemId });
  return response.data.assignmentId;
}