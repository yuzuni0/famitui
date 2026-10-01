import { doc, getDoc, getFirestore, updateDoc } from '@react-native-firebase/firestore';
import type { FamilyDoc, GeoPoint } from '../../types/firestore';
import { FAMILIES_COLLECTION, observeDocData } from './observe';
//familyIdの読み書き
function familyDocRef(familyId: string) {
  return doc(getFirestore(), FAMILIES_COLLECTION, familyId);
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

//familyIdを取得する
export async function fetchFamilyDoc(familyId: string): Promise<FamilyDoc | null> {
  const snapshot = await getDoc(familyDocRef(familyId));
  return snapshot.exists() ? (snapshot.data() as FamilyDoc) : null;
}

//自宅の位置を更新する
export async function updateHomeLocation(familyId: string, location: GeoPoint): Promise<void> {
  await updateDoc(familyDocRef(familyId), { homeLocation: location });
}