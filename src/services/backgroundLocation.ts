import BackgroundGeolocation from 'react-native-background-geolocation';
import type { Geofence } from 'react-native-background-geolocation';
import type { CategoryId, GeoPoint } from '../types/firestore';
import type { NearbyStore } from './storeActions';

const RELOCATE_DISTANCE_METERS = 500;
const TEST_DISTANCE_METERS = 3;
//パソコン甲子園提出時には必ずfalse,にしておく
const USE_TEST_DISTANCE = false;
export const MAX_GEOFENCES = 80;
export const GEOFENCE_RADIUS_METERS = 100;
//重要な依頼時の半径
export const IMPORTANT_GEOFENCE_RADIUS_METERS = 300;
let startPromise: Promise<void> | null = null;

//バックグラウンド位置情報を初期化する
export async function initBackgroundLocation(): Promise<void> {
  await BackgroundGeolocation.ready({
    geolocation: {
      desiredAccuracy: BackgroundGeolocation.DesiredAccuracy.High,
      distanceFilter: USE_TEST_DISTANCE ? TEST_DISTANCE_METERS : RELOCATE_DISTANCE_METERS,
    },
    app: {
      stopOnTerminate: false,
      startOnBoot: true,
    },
    logger: {
      debug: false,
      logLevel: BackgroundGeolocation.LogLevel.Off,
    },
  });
}

//位置の更新
export function onDistanceMoved(callback: (location: GeoPoint) => void): () => void {
  const subscription = BackgroundGeolocation.onLocation(location => {
    callback({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });
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
    notifyOnExit: false,
    extras: { storeName: store.storeName, categories: store.categories },
  };
}

//店舗を登録し直す
export async function replaceStoreGeofences(
  stores: NearbyStore[],
  radius: number,
): Promise<void> {
  await BackgroundGeolocation.removeGeofences();

  const targets = stores.slice(0, MAX_GEOFENCES);
  if (targets.length === 0) {
    return;
  }

  await BackgroundGeolocation.addGeofences(targets.map(store => toGeofence(store, radius)));
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