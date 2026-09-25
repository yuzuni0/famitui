import { distanceMeters } from '../lib/geo';
import type { FamilyDoc, GeoPoint, TransportMode } from '../types/firestore';
import { GEOFENCE_RADIUS_METERS, IMPORTANT_GEOFENCE_RADIUS_METERS, MAX_GEOFENCES, RELOCATE_DISTANCE_METERS, emitBackgroundEvent, fetchCurrentBackgroundLocation, fetchRegisteredStores, loadMonitorState, onDistanceMoved, onGeofenceEnter, onGeofenceExit, onTransportModeChanged, replaceStoreGeofences, saveMonitorState } from './device/backgroundLocation';
import type { BackgroundLocationEvent } from '../../modules/backgroundLocation';
import { getCurrentUid } from './device/auth';
import { fetchUserDoc } from './firestore/user';
import { observeFamilyDoc } from './firestore/family';
import { fetchItems, isAssigned, isRequested } from './firestore/item';
import type { ItemWithId } from './firestore/item';
import { isBusy, isTransportModeManual, observeMember, updateMemberStatus } from './firestore/member';
import type { MemberWithId } from './firestore/member';
import { notifyNearbyStore } from './device/notification';
import { SEARCH_RADIUS_METERS, fetchNearbyCandidates } from './api/overpass';
import type { StoreCandidate } from './api/overpass';
import { fetchStores } from './firestore/store';
import type { StoreWithId } from './firestore/store';
import { searchNearbyStores } from './functions/storeActions';
import type { NearbyStore } from './functions/storeActions';

//移動の検知から通知

//同じ店舗へ再通知しない間隔
const RENOTIFY_INTERVAL_MS = 30 * 60 * 1000;

const SEARCH_RETRY_INTERVAL_MS = 60 * 1000;
const SEARCH_RETRY_DELAY_MS = 90 * 1000;

let searching = false;
//検索中に届いた位置
let pendingLocation: GeoPoint | null = null;
let lastSearchCenter: GeoPoint | null = null;
let lastSearchAttemptTime = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function cancelRetry(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

//店舗ごとに最後に通知した時刻
const lastNotifiedTimes = new Map<string, number>();

//今いる店舗
const insideStoreIds = new Set<string>();

type MonitorState = {
  insideStoreIds: string[];
  lastNotifiedTimes: Record<string, number>;
  lastSearchCenter: GeoPoint | null;
};

//状態を引き継ぐ
function persistState(): void {
  saveMonitorState({
    insideStoreIds: [...insideStoreIds],
    lastNotifiedTimes: Object.fromEntries(lastNotifiedTimes),
    lastSearchCenter,
  } satisfies MonitorState);
}

function restoreState(): void {
  const state = loadMonitorState<MonitorState>();
  insideStoreIds.clear();
  lastNotifiedTimes.clear();
  lastSearchCenter = state?.lastSearchCenter ?? null;
  if (state === null) {
    return;
  }
  state.insideStoreIds.forEach(storeId => insideStoreIds.add(storeId));
  Object.entries(state.lastNotifiedTimes).forEach(([storeId, time]) => lastNotifiedTimes.set(storeId, time));
}

//店舗から出た時の処理
function leaveStore(storeId: string): void {
  if (!insideStoreIds.delete(storeId)) {
    return;
  }
  lastNotifiedTimes.delete(storeId);
  persistState();
  console.log('[geofence] 退出により再通知の抑制を解除', storeId);
}

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
    item =>
      item.isImportant === true &&
      isRequested(item) &&
      !isAssigned(item) &&
      item.status !== 'completed',
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

//前回の検索地点からの移動距離を確認する
function shouldSearch(location: GeoPoint): boolean {
  if (lastSearchCenter === null) {
    return true;
  }
  return distanceMeters(lastSearchCenter, location) >= RELOCATE_DISTANCE_METERS;
}

//周辺の店舗を取得してジオフェンスを登録し直す
async function handleMoved(familyId: string, location: GeoPoint): Promise<boolean> {
  if (searching) {
    pendingLocation = location;
    return false;
  }

  if (!shouldSearch(location)) {
    return false;
  }

  const now = Date.now();
  if (now - lastSearchAttemptTime < SEARCH_RETRY_INTERVAL_MS) {
    return false;
  }
  lastSearchAttemptTime = now;

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
    let candidates: StoreCandidate[] | null;
    try {
      candidates = await fetchNearbyCandidates(location);
    } catch (searchError) {
      console.warn('[geofence] 端末からの周辺検索に失敗。サーバーで検索します', searchError);
      candidates = null;
    }
    const stores = await searchNearbyStores(familyId, location, candidates);

    //指定店舗を新しく登録する
    const preferredIds = new Set(
      items
        .filter(item => item.status !== 'completed' && item.preferredStoreId !== null)
        .map(item => item.preferredStoreId as string),
    );
    const foundIds = new Set(stores.map(store => store.storeId));
    const preferred = saved
      .filter(store => preferredIds.has(store.id) && !foundIds.has(store.id))
      .map(toNearbyStore);
    await replaceStoreGeofences([...preferred, ...stores].slice(0, MAX_GEOFENCES), radius);
    lastSearchCenter = location;
    persistState();
    cancelRetry();
    console.log(`[geofence] 周辺検索の結果 ${stores.length} 件で登録`);
  } catch (error) {
    console.warn('geofenceMonitor: 周辺検索に失敗。保存済みの店舗を維持します', error);
    cancelRetry();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      console.log('[geofence] 周辺検索を再試行');
      void handleMoved(familyId, location);
    }, SEARCH_RETRY_DELAY_MS);
  } finally {
    searching = false;
  }

  const next = pendingLocation;
  pendingLocation = null;
  if (next !== null) {
    await handleMoved(familyId, next);
  }
  return true;
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

  if (insideStoreIds.has(store.storeId)) {
    return;
  }
  insideStoreIds.add(store.storeId);
  persistState();

  const now = Date.now();
  const lastNotified = lastNotifiedTimes.get(store.storeId);
  if (lastNotified !== undefined && now - lastNotified < RENOTIFY_INTERVAL_MS) {
    console.log('[geofence] 再通知の抑制中', store.storeName);
    return;
  }

  try {
    //予定中の制限
    const member = await readOnce<MemberWithId | null>((callback, onError) =>
      observeMember(familyId, uid, callback, onError),
    );
    if (member === null || isBusy(member)) {
      console.log('[geofence] 予定中のため通知しない');
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
    persistState();
  } catch (error) {
    console.warn('geofenceMonitor: 通知の判断に失敗しました', error);
  }
}

//現在地と登録済み店舗の距離から進入と退出を判定する
async function checkStores(familyId: string, uid: string, location: GeoPoint): Promise<void> {
  let registered;
  try {
    registered = await fetchRegisteredStores();
  } catch (error) {
    console.warn('geofenceMonitor: 登録済み店舗の取得に失敗しました', error);
    return;
  }

  const entered: NearbyStore[] = [];
  const currentIds = new Set<string>();
  for (const { store, radius } of registered) {
    if (distanceMeters(location, store.location) > radius) {
      continue;
    }
    currentIds.add(store.storeId);
    if (!insideStoreIds.has(store.storeId)) {
      entered.push(store);
    }
  }

  for (const storeId of [...insideStoreIds]) {
    if (!currentIds.has(storeId)) {
      leaveStore(storeId);
    }
  }

  for (const store of entered) {
    console.log('[geofence] アプリ側の判定で進入', store.storeName);
    await handleStoreEntered(familyId, uid, store);
  }
}

//移動手段の変更を保存する
async function handleTransportModeChanged(
  familyId: string,
  uid: string,
  mode: TransportMode,
): Promise<void> {
  try {
    const member = await readOnce<MemberWithId | null>((callback, onError) =>
      observeMember(familyId, uid, callback, onError),
    );
    if (member === null || isTransportModeManual(member)) {
      console.log('[activity] 手動設定中のため保存しない');
      return;
    }
    await updateMemberStatus(familyId, uid, { transportMode: mode });
  } catch (error) {
    console.warn('geofenceMonitor: 移動手段の保存に失敗しました', error);
  }
}

let activeMonitor: { familyId: string; uid: string; stop: () => void } | null = null;

//監視を開始する
export function startGeofenceMonitor(familyId: string, uid: string): () => void {
  activeMonitor?.stop();
  let active = true;
  let lastMode: TransportMode | null = null;
  lastSearchAttemptTime = 0;
  pendingLocation = null;
  cancelRetry();
  restoreState();

  async function handleLocation(location: GeoPoint): Promise<void> {
    await checkStores(familyId, uid, location);
    const registered = await handleMoved(familyId, location);
    if (active && registered) {
      await checkStores(familyId, uid, location);
    }
  }

  const unsubscribeMoved = onDistanceMoved(location => {
    if (!active) {
      return;
    }
    console.log('[geofence] 位置更新', location.latitude, location.longitude);
    void handleLocation(location);
  });

  //起動直後は位置の更新を待たない
  fetchCurrentBackgroundLocation()
    .then(location => {
      if (active) {
        return handleLocation(location);
      }
    })
    .catch(error => {
      console.warn('geofenceMonitor: 起動時の現在地の取得に失敗しました', error);
    });

  const unsubscribeEnter = onGeofenceEnter(store => {
    if (!active) {
      return;
    }
    void handleStoreEntered(familyId, uid, store);
  });

  const unsubscribeExit = onGeofenceExit(storeId => {
    if (!active) {
      return;
    }
    leaveStore(storeId);
  });

  //検知した移動手段を保存する
  const unsubscribeTransport = onTransportModeChanged(mode => {
    if (!active || mode === lastMode) {
      return;
    }
    lastMode = mode;
    void handleTransportModeChanged(familyId, uid, mode);
  });

  const stop = () => {
    active = false;
    cancelRetry();
    unsubscribeMoved();
    unsubscribeEnter();
    unsubscribeExit();
    unsubscribeTransport();
    if (activeMonitor?.stop === stop) {
      activeMonitor = null;
    }
  };
  activeMonitor = { familyId, uid, stop };
  return stop;
}

//位置情報イベントを受け取った時の処理
export async function handleBackgroundLocationEvent(event: BackgroundLocationEvent): Promise<void> {
  if (!(await ensureGeofenceMonitor())) {
    return;
  }
  emitBackgroundEvent(event);
}

export async function ensureGeofenceMonitor(): Promise<boolean> {
  if (activeMonitor !== null) {
    return true;
  }
  const uid = getCurrentUid();
  if (uid === null) {
    return false;
  }
  const user = await fetchUserDoc(uid);
  if (user === null || user.familyId === null) {
    return false;
  }
  startGeofenceMonitor(user.familyId, uid);
  return true;
}
