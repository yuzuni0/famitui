import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

//Functionsの呼び出し

const REGION = 'asia-northeast1';

export async function callFunction<Request, Result>(
  name: string,
  data: Request,
  options?: { timeoutMs: number },
): Promise<Result> {
  const callable = httpsCallable<Request, Result>(
    getFunctions(getApp(), REGION),
    name,
    options === undefined ? undefined : { timeout: options.timeoutMs },
  );
  const response = await callable(data);
  return response.data;
}