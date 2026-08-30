import BackgroundGeolocation from 'react-native-background-geolocation';
import type { GeoPoint } from '../types/firestore';

const RELOCATE_DISTANCE_METERS = 500;
const TEST_DISTANCE_METERS = 3;
const USE_TEST_DISTANCE = true;

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
      debug: true,
      logLevel: BackgroundGeolocation.LogLevel.Verbose,
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
  await BackgroundGeolocation.start();
}

//バックグラウンドの位置情報取得を停止する
export async function stopBackgroundLocation(): Promise<void> {
  await BackgroundGeolocation.stop();
}