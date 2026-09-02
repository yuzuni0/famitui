import type { GeoPoint, TransportMode } from '../types/firestore';
import { callFunction } from './functionsClient';

//経路を取得する Functions を呼び出す

//移動手段
export type RouteProfile = 'foot-walking' | 'cycling-regular' | 'driving-car';

//移動手段の切り替え
export const ROUTE_PROFILES: { id: RouteProfile; label: string }[] = [
  { id: 'foot-walking', label: '徒歩' },
  { id: 'cycling-regular', label: '自転車' },
  { id: 'driving-car', label: '車' },
];

export type RouteResult = {
  //経路の座標列
  coordinates: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
};

export function toRouteProfile(mode: TransportMode): RouteProfile {
  switch (mode) {
    case 'bike':
      return 'cycling-regular';
    case 'vehicle':
      return 'driving-car';
    case 'walk':
    case 'none':
      return 'foot-walking';
  }
}

//出発地から目的地までの経路を取得する
export async function getRoute(
  familyId: string,
  origin: GeoPoint,
  destination: GeoPoint,
  profile: RouteProfile,
): Promise<RouteResult> {
  return callFunction<
    { familyId: string; origin: GeoPoint; destination: GeoPoint; profile: RouteProfile },
    RouteResult
  >('getRoute', { familyId, origin, destination, profile });
}