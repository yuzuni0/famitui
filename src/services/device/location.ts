import * as Location from 'expo-location';
import type { GeoPoint } from '../../types/firestore';

// expo-locationで現在地を取得する
export async function fetchCurrentLocation(): Promise<GeoPoint | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const position = await Location.getCurrentPositionAsync();
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}