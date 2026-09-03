import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ItemWithId } from './item';
import type { NearbyStore } from './storeActions';

const NEARBY_CHANNEL_ID = 'nearby_2';

const APPROVAL_CHANNEL_ID = 'approval';

// 通知の初期化
export async function initNotifications(): Promise<void> {
  //通知を前面に表示する
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // 通知のチャンネルの作成
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(NEARBY_CHANNEL_ID, {
      name: '近くの店舗',
      importance: Notifications.AndroidImportance.MAX,
    });
    await Notifications.setNotificationChannelAsync(APPROVAL_CHANNEL_ID, {
      name: '依頼の承諾',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  await Notifications.requestPermissionsAsync();
}

// ついで買いの通知
export async function notifyNearbyStore(
  store: NearbyStore,
  items: ItemWithId[],
): Promise<string> {
  const itemNames = items.map(item => item.itemName).join('、');

  return Notifications.scheduleNotificationAsync({
    content: {
      title: '近くの店舗',
      body: `近くの${store.storeName}で${itemNames}が買えます`,
      data: {
        storeId: store.storeId,
        itemIds: items.map(item => item.id),
      },
    },
    trigger: Platform.OS === 'android' ? { channelId: NEARBY_CHANNEL_ID } : null,
  });
}
