import { getApp } from '@react-native-firebase/app';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import type { GeoPoint, TransportMode } from '../types/firestore'

const REGION = 'asia-northeast1';

const GET_ROUTE = 'getRoute';

//移動手段
export type RouteProfile = 'foot-walking' | 'cycling-regular' | 'driving-car';

//移動手段の切り替え
export const ROUTE_PROFILES: { id: RouteProfile; label: string }[] = [
  { id: 'foot-walking', label: '徒歩' },
  { id: 'cycling-regular', label: '自転車' },
  { id: 'driving-car', label: '車' },
];

//経路取得のリクエスト
type GetRouteRequest = {
  familyId: string;
  origin: GeoPoint;
  destination: GeoPoint;
  profile: RouteProfile;
};

export type RouteResult = {
  //経路の座標列
  coordinates: GeoPoint[];
  distanceMeters: number;
  durationSeconds: number;
};

function routeFunctions() {
  return getFunctions(getApp(), REGION);
}

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
  const callable = httpsCallable<GetRouteRequest, RouteResult>(routeFunctions(), GET_ROUTE);
  const response = await callable({ familyId, origin, destination, profile });
  return response.data;
}