import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';

import App from './App';
import { TASK_NAME } from './modules/backgroundLocation';
import type { BackgroundLocationEvent } from './modules/backgroundLocation';
import { handleBackgroundLocationEvent } from './src/services/geofenceMonitor';

//位置イベントを受け取る
AppRegistry.registerHeadlessTask(TASK_NAME, () => async (event: BackgroundLocationEvent) => {
  try {
    await handleBackgroundLocationEvent(event);
  } catch (error) {
    console.warn('[backgroundLocation] イベントの処理に失敗', error);
  }
});

registerRootComponent(App);