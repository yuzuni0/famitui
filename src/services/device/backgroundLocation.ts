import * as Location from 'expo-location';
import { PermissionsAndroid } from 'react-native';
import * as BackgroundLocation from '../../../modules/backgroundLocation';
import type { BackgroundLocationEvent } from '../../../modules/backgroundLocation';
import type { CategoryId, GeoPoint, TransportMode } from '../../types/firestore';
import type { NearbyStore } from '../functions/storeActions';

const TEST_DISTANCE_METERS = 3;
//パソコン甲子園提出時には必ずfalse,にしておく
const USE_TEST_DISTANCE = false;
export const RELOCATE_DISTANCE_METERS = USE_TEST_DISTANCE ? TEST_DISTANCE_METERS : 20;
const LOCATION_UPDATE_DISTANCE_METERS = USE_TEST_DISTANCE ? TEST_DISTANCE_METERS : 5;
export const MAX_GEOFENCES = 80;
export const GEOFENCE_RADIUS_METERS = 100;
//重要な依頼時の半径
export const IMPORTANT_GEOFENCE_RADIUS_METERS = 300;
const NOTIFICATION_TITLE = 'ファミつい';
const NOTIFICATION_BODY = '近くの店舗を確認しています';
const MONITOR_STATE_KEY = 'monitorState';

type Listener<T> = (value: T) => void;
const locationListeners = new Set<Listener<GeoPoint>>();
const enterListeners = new Set<Listener<NearbyStore>>();
const exitListeners = new Set<Listener<string>>();
const transportListeners = new Set<Listener<TransportMode>>();

function subscribe<T>(listeners: Set<Listener<T>>, callback: Listener<T>): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

//位置の更新
export function onDistanceMoved(callback: (location: GeoPoint) => void): () => void {
  return subscribe(locationListeners, callback);
}

export function onTransportModeChanged(callback: (mode: TransportMode) => void): () => void {
  return subscribe(transportListeners, callback);
}

//ジオフェンスに入った時の処理
export function onGeofenceEnter(callback: (store: NearbyStore) => void): () => void {
  return subscribe(enterListeners, callback);
}

//ジオフェンス退出時の処理
export function onGeofenceExit(callback: (storeId: string) => void): () => void {
  return subscribe(exitListeners, callback);
}

function toCategories(categories: string[]): CategoryId[] {
  return categories.filter((entry): entry is CategoryId => typeof entry === 'string');
}

//位置情報を受け取る
export function emitBackgroundEvent(event: BackgroundLocationEvent): void {
  switch (event.type) {
    case 'location':
      locationListeners.forEach(listener => listener({ latitude: event.latitude, longitude: event.longitude }));
      return;
    case 'geofence':
      if (event.action === 'exit') {
        exitListeners.forEach(listener => listener(event.storeId));
        return;
      }
      enterListeners.forEach(listener =>
        listener({
          storeId: event.storeId,
          storeName: event.storeName,
          location: { latitude: event.latitude, longitude: event.longitude },
          categories: toCategories(event.categories),
        }),
      );
      return;
    case 'activity':
      transportListeners.forEach(listener => listener(event.mode));
  }
}

//現在地を取得する
export async function fetchCurrentBackgroundLocation(): Promise<GeoPoint> {
  return BackgroundLocation.getCurrentPosition();
}

async function requestPermissions(): Promise<void> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    throw new Error('位置情報の権限が許可されていません。');
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) {
    throw new Error('位置情報を「常に許可」にしてください。');
  }
  if (!BackgroundLocation.hasActivityPermission()) {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
  }
}

//バックグラウンドで位置情報を取得する
export async function startBackgroundLocation(): Promise<void> {
  await requestPermissions();
  await BackgroundLocation.start({
    notificationTitle: NOTIFICATION_TITLE,
    notificationBody: NOTIFICATION_BODY,
    distanceMeters: LOCATION_UPDATE_DISTANCE_METERS,
  });
}

//バックグラウンドの位置情報取得を停止する
export async function stopBackgroundLocation(): Promise<void> {
  BackgroundLocation.setValue(MONITOR_STATE_KEY, null);
  await BackgroundLocation.stop();
}

//店舗を登録し直す
export async function replaceStoreGeofences(stores: NearbyStore[], radius: number): Promise<void> {
  const targets = stores.slice(0, MAX_GEOFENCES).map(store => ({
    storeId: store.storeId,
    storeName: store.storeName,
    latitude: store.location.latitude,
    longitude: store.location.longitude,
    categories: store.categories,
  }));
  await BackgroundLocation.replaceGeofences(targets, radius);
  console.log(`[geofence] ${targets.length} 件を登録`);
}

//登録済みの店舗を取得する
export type RegisteredStore = { store: NearbyStore; radius: number };

export async function fetchRegisteredStores(): Promise<RegisteredStore[]> {
  return BackgroundLocation.getRegisteredStores().map(entry => ({
    store: {
      storeId: entry.storeId,
      storeName: entry.storeName,
      location: { latitude: entry.latitude, longitude: entry.longitude },
      categories: toCategories(entry.categories),
    },
    radius: entry.radius,
  }));
}

//位置情報の状態を保存する
export function loadMonitorState<T>(): T | null {
  const raw = BackgroundLocation.getValue(MONITOR_STATE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveMonitorState(state: unknown): void {
  BackgroundLocation.setValue(MONITOR_STATE_KEY, JSON.stringify(state));
}