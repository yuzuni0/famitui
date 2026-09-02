import { CallableRequest, HttpsError } from "firebase-functions/https";
import { DocumentReference, Firestore } from "firebase-admin/firestore";
import { GeoPoint, isGeoPoint } from "./geo";

// 認証済みユーザーの情報を取得する
export function requireAuth(request: CallableRequest): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  return request.auth.uid;
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${name} は文字列で指定してください。`
    );
  }
  return value;
}

export function requireNonEmptyString(value: unknown, name: string): string {
  if (!isNonEmptyString(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${name} は文字列で指定してください。`
    );
  }
  return value;
}

export function requireGeoPoint(value: unknown, name: string): GeoPoint {
  if (!isGeoPoint(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${name} は有効な座標で指定してください。`
    );
  }
  return value;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string");
}

// 家族グループへの所属を確認し、familyIdへの参照を返す
export async function requireMembership(
  db: Firestore,
  familyId: string,
  uid: string
): Promise<DocumentReference> {
  const familyRef = db.collection("families").doc(familyId);
  const memberSnapshot = await familyRef.collection("members").doc(uid).get();
  if (!memberSnapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "この家族グループに所属していません。"
    );
  }
  return familyRef;
}
