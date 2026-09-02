import type { GeoPoint } from '../types/firestore';
//座標に関連の計算

//地球の半径（メートル）
const EARTH_RADIUS_METERS = 6371000;

//緯度と経度の値を確認する
export function isGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { latitude, longitude } = value as { latitude?: unknown; longitude?: unknown };
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return false;
  }
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return false;
  }
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

//度数をラジアンに変換する
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

//2点の距離をメートルで返す
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);

  //距離を計算する
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;

  //距離を返す
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}