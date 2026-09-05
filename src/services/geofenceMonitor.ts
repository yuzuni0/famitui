import { distanceMeters } from '../lib/geo';
import type { FamilyDoc, GeoPoint } from '../types/firestore';
import { MAX_GEOFENCES, onDistanceMoved, onGeofenceEnter, replaceStoreGeofences } from './backgroundLocation';
import { observeFamilyDoc } from './family';
import { fetchItems, isAssigned, isRequested } from './item';
import type { ItemWithId } from './item';
import { isBusy, observeMember } from './member';
import type { MemberWithId } from './member';
import { notifyNearbyStore } from './notification';
import { SEARCH_RADIUS_METERS, fetchNearbyCandidates } from './overpass';
import { fetchStores } from './store';
import type { StoreWithId } from './store';
import { searchNearbyStores } from './storeActions';
import type { NearbyStore } from './storeActions';

//移動の検知から通知

//同じ店舗へ再通知しない間隔
const RENOTIFY_INTERVAL_MS = 30 * 60 * 1000;

const GEOFENCE_RADIUS_METERS = 100;
//重要な依頼時の半径
const IMPORTANT_GEOFENCE_RADIUS_METERS = 300;

let searching = false;

//店舗ごとに最後に通知した時刻
const lastNotifiedTimes = new Map<string, number>();

//値を取得し、Promiseを返す
function readOnce<T>(
  subscribe: (callback: (value: T) => void, onError: (error: Error) => void) => () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;

    const finish = () => {
      settled = true;
      unsubscribe?.();
    };

    unsubscribe = subscribe(
      value => {
        if (settled) {
          return;
        }
        finish();
        resolve(value);
      },
      error => {
        if (settled) {
          return;
        }
        finish();
        reject(error);
      },
    );
    if (settled) {
      unsubscribe();
    }
  });
}

//重要な依頼を確認する
function hasImportantRequest(items: ItemWithId[]): boolean {
  return items.some(
    item => item.isImportant === true && isRequested(item) && !isAssigned(item),
  );
}

//保存済みの店舗を変換する
function toNearbyStore(store: StoreWithId): NearbyStore {
  return {
    storeId: store.id,
    storeName: store.storeName,
    location: store.location,
    categories: store.categories,
  };
}

//周辺の店舗を取得してジオフェンスを登録し直す
async function handleMoved(familyId: string, location: GeoPoint): Promise<void> {
  if (searching) {
    return;
  }

  searching = true;
  try {
    const items = await fetchItems(familyId);
    const radius = hasImportantRequest(items)
      ? IMPORTANT_GEOFENCE_RADIUS_METERS
      : GEOFENCE_RADIUS_METERS;

    //現在地付近の店舗の登録
    const saved = await fetchStores(familyId);
    const nearby = saved
      .map(store => ({ store, distance: distanceMeters(location, store.location) }))
      .filter(entry => entry.distance <= SEARCH_RADIUS_METERS)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_GEOFENCES)
      .map(entry => toNearbyStore(entry.store));
    if (nearby.length > 0) {
      await replaceStoreGeofences(nearby, radius);
      console.log(`[geofence] 保存済みの店舗 ${nearby.length} 件で登録`);
    }

    //周辺を検索・登録する
    const candidates = await fetchNearbyCandidates(location);
    const stores = await searchNearbyStores(familyId, location, candidates);
    await replaceStoreGeofences(stores, radius);
    console.log(`[geofence] 周辺検索の結果 ${stores.length} 件で登録`);
  } catch (error) {
    console.warn('geofenceMonitor: 周辺検索に失敗。保存済みの店舗を維持します', error);
  } finally {
    searching = false;
  }
}

//通知すべきかを判断する
function shouldNotify(
  item: ItemWithId,
  store: NearbyStore,
  uid: string,
  homeLocation: GeoPoint | null,
): boolean {
  if (item.status === 'completed') {
    console.log('[geofence] 完了済みのため対象外', item.itemName);
    return false;
  }

  if (!isRequested(item) || isAssigned(item)) {
    console.log('[geofence] 依頼中で担当未定ではないため対象外', item.itemName);
    return false;
  }

  //自分が辞退したものは除く
  if (item.rejectedUserIds.includes(uid)) {
    console.log('[geofence] 自分が辞退済みのため対象外', item.itemName);
    return false;
  }

  //指定店舗がある品目は、その店舗でのみ通知する
  if (item.preferredStoreId !== null) {
    if (item.preferredStoreId !== store.storeId) {
      console.log('[geofence] 指定店舗と一致しないため対象外', item.itemName);
      return false;
    }
  } else if (!store.categories.includes(item.category)) {
    console.log('[geofence] カテゴリが一致しないため対象外', item.itemName, item.category);
    return false;
  }

  //自宅からの距離制限がある場合は、自宅からの距離を計算する
  if (item.maxDistanceMeters !== null && homeLocation !== null) {
    const distance = distanceMeters(homeLocation, store.location);
    if (distance > item.maxDistanceMeters) {
      console.log(
        '[geofence] 距離の上限を超えるため対象外',
        item.itemName,
        `${Math.round(distance)}m > ${item.maxDistanceMeters}m`,
      );
      return false;
    }
  }

  console.log('[geofence] 通知対象', item.itemName);
  return true;
}

//店舗に入ったときの処理
export async function handleStoreEntered(
  familyId: string,
  uid: string,
  store: NearbyStore,
): Promise<void> {
  const now = Date.now();
  const lastNotified = lastNotifiedTimes.get(store.storeId);
  if (lastNotified !== undefined && now - lastNotified < RENOTIFY_INTERVAL_MS) {
    console.log('[geofence] 再通知の抑制中', store.storeName);
    return;
  }

  try {
    //拘束中の制限
    const member = await readOnce<MemberWithId | null>((callback, onError) =>
      observeMember(familyId, uid, callback, onError),
    );
    if (member === null || isBusy(member)) {
      console.log('[geofence] 拘束中のため通知しない');
      return;
    }

    const [items, family] = await Promise.all([
      fetchItems(familyId),
      readOnce<FamilyDoc | null>((callback, onError) =>
        observeFamilyDoc(familyId, callback, onError),
      ),
    ]);
    const homeLocation = family?.homeLocation ?? null;

    const targets = items.filter(item => shouldNotify(item, store, uid, homeLocation));
    console.log('[geofence] 品目', items.length, '件、対象', targets.length, '件');
    if (targets.length === 0) {
      return;
    }

    await notifyNearbyStore(store, targets);
    lastNotifiedTimes.set(store.storeId, now);
  } catch (error) {
    console.warn('geofenceMonitor: 通知の判断に失敗しました', error);
  }
}

//監視を開始する
export function startGeofenceMonitor(familyId: string, uid: string): () => void {
  let active = true;

  const unsubscribeMoved = onDistanceMoved(location => {
    if (!active) {
      return;
    }
    void handleMoved(familyId, location);
  });

  const unsubscribeEnter = onGeofenceEnter(store => {
    if (!active) {
      return;
    }
    void handleStoreEntered(familyId, uid, store);
  });

  return () => {
    active = false;
    unsubscribeMoved();
    unsubscribeEnter();
  };
}
