import type { GeoPoint } from '../types/firestore';

//MapTiler のスタイル
export const MAP_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY ?? ''}`;

//位置情報が無い時に使う座標（東京駅）
export const DEFAULT_CENTER: GeoPoint = { latitude: 35.681236, longitude: 139.767125 };

//GeoPoint を MapLibre の座標に変換する
export function toLngLat(point: GeoPoint): [number, number] {
  return [point.longitude, point.latitude];
}