import { getStorage, putFile, ref } from '@react-native-firebase/storage';
//撮影した画像を Cloud Storage へアップロードする

const FAMILIES_SEGMENT = 'families';

const PHOTOS_SEGMENT = 'photos';

const PHOTO_EXTENSION = 'jpg';

const PHOTO_CONTENT_TYPE = 'image/jpeg';

//数値を指定の桁へ揃える
function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

//撮影日時からファイル名を作る
function photoFileName(takenAt: Date): string {
  const year = pad(takenAt.getFullYear(), 4);
  const month = pad(takenAt.getMonth() + 1, 2);
  const day = pad(takenAt.getDate(), 2);
  const hours = pad(takenAt.getHours(), 2);
  const minutes = pad(takenAt.getMinutes(), 2);
  const seconds = pad(takenAt.getSeconds(), 2);
  const milliseconds = pad(takenAt.getMilliseconds(), 3);
  return `${year}${month}${day}_${hours}${minutes}${seconds}_${milliseconds}.${PHOTO_EXTENSION}`;
}

function photoStoragePath(familyId: string, fileName: string): string {
  return `${FAMILIES_SEGMENT}/${familyId}/${PHOTOS_SEGMENT}/${fileName}`;
}

//端末上の画像をストレージにアップロードする
export async function uploadPhoto(familyId: string, localUri: string): Promise<string> {
  const path = photoStoragePath(familyId, photoFileName(new Date()));
  await putFile(ref(getStorage(), path), localUri, { contentType: PHOTO_CONTENT_TYPE });
  return path;
}