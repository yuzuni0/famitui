import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ItemWithId } from '../firestore/item';
import type { NearbyStore } from '../functions/storeActions';

const NEARBY_CHANNEL_ID = 'nearby_2';

const APPROVAL_CHANNEL_ID = 'approval';

const CHAT_CHANNEL_ID = 'chat';

export type NotificationData =
  | { kind: 'nearbyStore'; storeId: string; itemIds: string[] }
  | { kind: 'approval'; itemId: string }
  | { kind: 'chat'; familyId: string; assignmentId: string; itemName: string; partnerUserId: string };

let openChatAssignmentId: string | null = null;

export function setOpenChatAssignmentId(assignmentId: string | null): void {
  openChatAssignmentId = assignmentId;
}

// 通知の初期化
export async function initNotifications(): Promise<void> {
  //通知を前面に表示する
  Notifications.setNotificationHandler({
    handleNotification: async notification => {
      const data = parseNotificationData(notification.request.content.data);
      //通知を非表示時限定にする
      const suppress =
        data?.kind === 'chat' && openChatAssignmentId === data.assignmentId;
      return {
        shouldShowBanner: !suppress,
        shouldShowList: !suppress,
        shouldPlaySound: !suppress,
        shouldSetBadge: false,
      };
    },
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
    await Notifications.setNotificationChannelAsync(CHAT_CHANNEL_ID, {
      name: 'チャット',
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
        kind: 'nearbyStore',
        storeId: store.storeId,
        itemIds: items.map(item => item.id),
      } satisfies NotificationData,
    },
    trigger: Platform.OS === 'android' ? { channelId: NEARBY_CHANNEL_ID } : null,
  });
}

// 依頼の承諾の通知
export function parseNotificationData(data: unknown): NotificationData | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;

  if (record.kind === 'nearbyStore') {
    const itemIds = toStringArray(record.itemIds);
    if (typeof record.storeId !== 'string' || itemIds.length === 0) {
      return null;
    }
    return { kind: 'nearbyStore', storeId: record.storeId, itemIds };
  }

  if (record.kind === 'approval') {
    const itemId = typeof record.itemId === 'string' ? record.itemId : toStringArray(record.itemIds)[0];
    if (itemId === undefined) {
      return null;
    }
    return { kind: 'approval', itemId };
  }

  if (record.kind === 'chat') {
    const { familyId, assignmentId, itemName, partnerUserId } = record;
    if (
      typeof familyId !== 'string' ||
      typeof assignmentId !== 'string' ||
      typeof itemName !== 'string' ||
      typeof partnerUserId !== 'string'
    ) {
      return null;
    }
    return { kind: 'chat', familyId, assignmentId, itemName, partnerUserId };
  }

  return null;
}

// FCMを経由する時はJSON
function toStringArray(value: unknown): string[] {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
}
