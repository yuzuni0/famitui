import BackgroundGeolocation from 'react-native-background-geolocation';
import type { Geofence, MotionActivityType } from 'react-native-background-geolocation';
import type { CategoryId, GeoPoint, TransportMode } from '../../types/firestore';
import type { NearbyStore } from '../functions/storeActions';

const TEST_DISTANCE_METERS = 3;
//パソコン甲子園提出時には必ずfalse,にしておく
const USE_TEST_DISTANCE = true;
export const RELOCATE_DISTANCE_METERS = USE_TEST_DISTANCE ? TEST_DISTANCE_METERS : 500;
const LOCATION_UPDATE_DISTANCE_METERS = USE_TEST_DISTANCE ? TEST_DISTANCE_METERS : 30;
export const MAX_GEOFENCES = 80;
export const GEOFENCE_RADIUS_METERS = 100;
//重要な依頼時の半径
export const IMPORTANT_GEOFENCE_RADIUS_METERS = 300;
const CURRENT_POSITION_TIMEOUT_SECONDS = 30;
const CURRENT_POSITION_MAX_AGE_MS = 60 * 1000;
let startPromise: Promise<void> | null = null;

//バックグラウンド位置情報を初期化する
export async function initBackgroundLocation(): Promise<void> {
  await BackgroundGeolocation.ready({
    geolocation: {
      desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High,
      distanceFilter: LOCATION_UPDATE_DISTANCE_METERS,
      geofenceModeHighAccuracy: true,
      disableStopDetection: true,
    },
    app: {
      stopOnTerminate: false,
      startOnBoot: true,
    },
    logger: {
      debug: false,
      logLevel: __DEV__ ? BackgroundGeolocation.LogLevel.Verbose : BackgroundGeolocation.LogLevel.Off,
    },
  });
}

//位置の更新
export function onDistanceMoved(callback: (location: GeoPoint) => void): () => void {
  const subscription = BackgroundGeolocation.onLocation(location => {
    if (location.sample === true) {
      return;
    }
    callback({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
  });
  return () => subscription.remove();
}

//現在地を取得する
export async function fetchCurrentBackgroundLocation(): Promise<GeoPoint> {
  const location = await BackgroundGeolocation.getCurrentPosition({
    samples: 1,
    persist: false,
    timeout: CURRENT_POSITION_TIMEOUT_SECONDS,
    maximumAge: CURRENT_POSITION_MAX_AGE_MS,
  });
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

//判定結果を移動手段に変換する
function toTransportMode(activity: MotionActivityType): TransportMode | null {
  switch (activity) {
    case 'walking':
    case 'on_foot':
    case 'running':
      return 'walk';
    case 'on_bicycle':
      return 'bike';
    case 'in_vehicle':
      return 'vehicle';
    case 'still':
      return 'none';
    default:
      return null;
  }
}

//移動手段の変化を取得する
export function onTransportModeChanged(callback: (mode: TransportMode) => void): () => void {
  const subscription = BackgroundGeolocation.onActivityChange(event => {
    const mode = toTransportMode(event.activity);
    if (mode === null) {
      return;
    }
    callback(mode);
  });
  return () => subscription.remove();
}

//バックグラウンドで位置情報を取得する
export async function startBackgroundLocation(): Promise<void> {
  if (startPromise !== null) {
    //進行中・開始済みの処理を待つ
    await startPromise;
    return;
  }
  startPromise = (async () => {
    const state = await BackgroundGeolocation.getState();
    if (!state.enabled) {
      await BackgroundGeolocation.start();
    }
    const moving = await BackgroundGeolocation.changePace(true);
    console.log('[location] 状態', {
      enabled: moving.enabled,
      isMoving: moving.isMoving,
      trackingMode: moving.trackingMode,
    });
  })();
  try {
    await startPromise;
  } catch (error) {
    startPromise = null;
    throw error;
  }
}

//バックグラウンドの位置情報取得を停止する
export async function stopBackgroundLocation(): Promise<void> {
  startPromise = null;
  await BackgroundGeolocation.stop();
}

//店舗をジオフェンスの形式に変換する
function toGeofence(store: NearbyStore, radius: number): Geofence {
  return {
    identifier: store.storeId,
    latitude: store.location.latitude,
    longitude: store.location.longitude,
    radius,
    notifyOnEntry: true,
    notifyOnExit: true,
    extras: { storeName: store.storeName, categories: store.categories },
  };
}

//店舗を登録し直す
export async function replaceStoreGeofences(
  stores: NearbyStore[],
  radius: number,
): Promise<void> {
  const targets = new Map(stores.slice(0, MAX_GEOFENCES).map(store => [store.storeId, store]));
  const existing = await BackgroundGeolocation.getGeofences();

  const staleIds = existing
    .filter(
      geofence =>
        targets.get(geofence.identifier) === undefined ||
        geofence.radius !== radius ||
        geofence.notifyOnExit !== true,
    )
    .map(geofence => geofence.identifier);
  if (staleIds.length > 0) {
    await BackgroundGeolocation.removeGeofences(staleIds);
  }

  const keptIds = new Set(
    existing.filter(geofence => !staleIds.includes(geofence.identifier)).map(geofence => geofence.identifier),
  );
  const added = [...targets.values()].filter(store => !keptIds.has(store.storeId));
  if (added.length > 0) {
    await BackgroundGeolocation.addGeofences(added.map(store => toGeofence(store, radius)));
  }
  console.log(`[geofence] 維持 ${keptIds.size} 件、追加 ${added.length} 件、削除 ${staleIds.length} 件`);
}

//店舗のジオフェンスを削除する
function toNearbyStore(
  identifier: string,
  location: GeoPoint,
  extras: Record<string, unknown> | undefined,
): NearbyStore {
  const storeName = typeof extras?.storeName === 'string' ? extras.storeName : '';
  const categories = Array.isArray(extras?.categories)
    ? extras.categories.filter((entry): entry is CategoryId => typeof entry === 'string')
    : [];

  return { storeId: identifier, storeName, location, categories };
}

//登録済みの店舗を取得する
export type RegisteredStore = { store: NearbyStore; radius: number };

export async function fetchRegisteredStores(): Promise<RegisteredStore[]> {
  const geofences = await BackgroundGeolocation.getGeofences();
  return geofences.map(geofence => ({
    store: toNearbyStore(
      geofence.identifier,
      { latitude: geofence.latitude, longitude: geofence.longitude },
      geofence.extras,
    ),
    radius: geofence.radius,
  }));
}

//ジオフェンスに入った時の処理を登録する
export function onGeofenceEnter(callback: (store: NearbyStore) => void): () => void {
  const subscription = BackgroundGeolocation.onGeofence(event => {
    if (event.action !== 'ENTER') {
      return;
    }

    callback(
      toNearbyStore(
        event.identifier,
        {
          latitude: event.location.coords.latitude,
          longitude: event.location.coords.longitude,
        },
        event.extras,
      ),
    );
  });
  return () => subscription.remove();
}

//ジオフェンス退出時の処理
export function onGeofenceExit(callback: (storeId: string) => void): () => void {
  const subscription = BackgroundGeolocation.onGeofence(event => {
    if (event.action !== 'EXIT') {
      return;
    }
    callback(event.identifier);
  });
  return () => subscription.remove();
}