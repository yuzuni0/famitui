import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/errors';
import { categoryLabel } from '../../lib/format';
import { distanceMeters } from '../../lib/geo';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { fetchNearbyCandidates } from '../../services/api/overpass';
import { fetchCurrentLocation } from '../../services/device/location';
import { isExpired, observeAssignment, remainingLabel } from '../../services/firestore/assignment';
import type { AssignmentWithId } from '../../services/firestore/assignment';
import { observeFamilyDoc } from '../../services/firestore/family';
import { observeItems } from '../../services/firestore/item';
import type { ItemWithId } from '../../services/firestore/item';
import { cancelAssignment } from '../../services/functions/itemActions';
import { observeMembers } from '../../services/firestore/member';
import type { MemberWithId } from '../../services/firestore/member';
import { observeStores } from '../../services/firestore/store';
import type { StoreWithId } from '../../services/firestore/store';
import { searchNearbyStores } from '../../services/functions/storeActions';
import type { NearbyStore } from '../../services/functions/storeActions';
import type { FamilyDoc, GeoPoint } from '../../types/firestore';

//担当している不足品の詳細を表示し、ナビとかに遷移するための画面
type Props = {
  familyId: string;
  uid: string;
  itemId: string;
};

type ActionButtonProps = {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  half?: boolean;
  disabled: boolean;
  onPress: () => void;
};

//フッター操作
function ActionButton({ title, variant = 'secondary', half = false, disabled, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        half && styles.actionButtonHalf,
        variant === 'primary' && styles.actionButtonPrimary,
        variant === 'danger' && styles.actionButtonDanger,
        pressed && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      <Text
        style={[
          styles.actionTitle,
          variant === 'primary' && styles.actionTitlePrimary,
          variant === 'danger' && styles.actionTitleDanger,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

export default function TaskDetailPage({ familyId, uid, itemId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [members, setMembers] = useState<MemberWithId[] | null>(null);
  const [stores, setStores] = useState<StoreWithId[] | null>(null);
  const [family, setFamily] = useState<FamilyDoc | null>(null);
  const [assignment, setAssignment] = useState<AssignmentWithId | null>(null);
  const [assignmentLoaded, setAssignmentLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchingStore, setSearchingStore] = useState(false);

  const assignmentId = `${itemId}_${uid}`;

  //不足品を監視する
  useEffect(() => {
    setItems(null);
    setError(null);

    const unsubscribe = observeItems(
      familyId,
      nextItems => {
        setItems(nextItems);
        setError(null);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId]);

  //依頼者の表示名を取得するために監視する
  useEffect(() => {
    setMembers(null);
    setError(null);

    const unsubscribe = observeMembers(
      familyId,
      nextMembers => {
        setMembers(nextMembers);
        setError(null);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId]);

  //購入する店舗の名前を表示するための監視
  useEffect(() => {
    setStores(null);
    const unsubscribe = observeStores(familyId, setStores, observeError => {
      setError(errorMessage(observeError));
    });
    return unsubscribe;
  }, [familyId]);

  //自宅の位置を距離の判定に使う
  useEffect(() => {
    setFamily(null);
    const unsubscribe = observeFamilyDoc(familyId, setFamily, observeError => {
      setError(errorMessage(observeError));
    });
    return unsubscribe;
  }, [familyId]);

  //自分の担当品を監視する
  useEffect(() => {
    setAssignment(null);
    setAssignmentLoaded(false);
    setError(null);

    const unsubscribe = observeAssignment(
      familyId,
      assignmentId,
      nextAssignment => {
        setAssignment(nextAssignment);
        setAssignmentLoaded(true);
        setError(null);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId, assignmentId]);

  //一覧から対象の品目を絞り込む
  const item = useMemo(
    () => (items === null ? null : items.find(entry => entry.id === itemId) ?? null),
    [items, itemId],
  );

  //uid から表示名を取得する
  const requesterName = useMemo(() => {
    if (item === null) {
      return '依頼なし';
    }
    if (item.requesterUserId === null) {
      return '依頼なし';
    }
    return (
      members?.find(member => member.id === item.requesterUserId)?.displayName ??
      item.requesterUserId
    );
  }, [item, members]);

  //購入する店舗の名前を取得する
  const preferredStoreName = useMemo(() => {
    if (item === null || item.preferredStoreId === null) {
      return '指定なし';
    }
    const found = stores?.find(store => store.id === item.preferredStoreId);
    if (found !== undefined) {
      return found.storeName;
    }
    if (stores === null) {
      return '読み込み中…';
    }
    return '指定した店舗が見つかりません';
  }, [item, stores]);

  //担当を辞退して依頼品へ戻す
  async function handleCancelAssignment() {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await cancelAssignment(familyId, itemId);
    } catch (submitError) {
      setError(errorMessage(submitError, 'cancelAssignment'));
      setSubmitting(false);
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  //現在地から最も近い店舗
  function pickNearestStore(
    candidates: NearbyStore[],
    location: GeoPoint,
    target: ItemWithId,
  ): NearbyStore | null {
    const homeLocation = family?.homeLocation ?? null;
    const matched = candidates.filter(store => {
      if (!store.categories.includes(target.category)) {
        return false;
      }
      if (target.maxDistanceMeters !== null && homeLocation !== null) {
        return distanceMeters(homeLocation, store.location) <= target.maxDistanceMeters;
      }
      return true;
    });
    if (matched.length === 0) {
      return null;
    }
    return matched.reduce((nearest, store) =>
      distanceMeters(location, store.location) < distanceMeters(location, nearest.location)
        ? store
        : nearest,
    );
  }

  //最寄りの店舗を探してナビゲーションに遷移する
  async function handleNavigateNearestStore() {
    if (item === null || searchingStore) {
      return;
    }

    setError(null);
    setSearchingStore(true);

    try {
      const location = await fetchCurrentLocation();
      if (location === null) {
        setError('位置情報の利用が許可されていません。');
        return;
      }

      //保存済みの店舗から探す
      const saved = (stores ?? []).map(store => ({
        storeId: store.id,
        storeName: store.storeName,
        location: store.location,
        categories: store.categories,
      }));
      let nearest = pickNearestStore(saved, location, item);

      //見つからなければ周辺を検索する
      if (nearest === null) {
        const candidates = await fetchNearbyCandidates(location);
        const found = await searchNearbyStores(familyId, location, candidates);
        nearest = pickNearestStore(found, location, item);
      }

      if (nearest === null) {
        setError('この品目を扱う店舗が近くに見つかりませんでした。');
        return;
      }

      navigation.navigate('Route', { storeId: nearest.storeId });
    } catch (searchError) {
      setError(errorMessage(searchError));
    } finally {
      setSearchingStore(false);
    }
  }

  //辞退の前に確認をする
  function confirmCancelAssignment() {
    Alert.alert('確認', `「${item?.itemName}」の担当を辞退しますか。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '辞退する', style: 'destructive', onPress: handleCancelAssignment },
    ]);
  }

  //読み込み中はローディング表示をする
  if (items === null || members === null || !assignmentLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#06c" />
        <Text style={styles.loadingText}>担当の詳細を読み込んでいます…</Text>
        {error !== null && (
          <View style={[styles.errorBanner, styles.loadingBanner]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  //担当から外れた時にエラー
  if (item === null || assignment === null) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIcon}>❓</Text>
          </View>
          <Text style={styles.emptyTitle}>
            {item === null ? '品目が見つかりません' : '担当が見つかりません'}
          </Text>
          <Text style={styles.emptyDescription}>
            {item === null
              ? 'この品目は削除された可能性があります。'
              : 'この品目の担当はすでに解除されています。'}
          </Text>
        </View>
      </View>
    );
  }

  //担当として有効化を確認する
  const active = assignment.status === 'active';

  //ナビゲーションで向かう店舗
  const preferredStoreId = item.preferredStoreId;
  //チャットの相手
  const requesterUserId = item.requesterUserId;

  return (
    <View style={styles.container}>
      {(error !== null || !active) && (
        <View style={styles.banners}>
          {error !== null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {!active && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>この品目の担当ではなくなりました。</Text>
            </View>
          )}
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.itemName}>{item.itemName}</Text>
            <View style={styles.chips}>
              <View style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{categoryLabel(item.category)}</Text>
              </View>
              {item.isImportant && (
                <View style={styles.importantBadge}>
                  <Text style={styles.importantBadgeText}>重要</Text>
                </View>
              )}
              <Text style={[styles.deadline, isExpired(assignment) && styles.deadlineExpired]}>
                {remainingLabel(assignment)}
              </Text>
            </View>
          </View>

          <DetailRow label="依頼者">
            <Text style={styles.value}>{requesterName}</Text>
          </DetailRow>

          <DetailRow label="購入する店舗">
            <Text style={styles.value}>{preferredStoreName}</Text>
          </DetailRow>

          <DetailRow label="距離の上限">
            <Text style={styles.value}>
              {item.maxDistanceMeters != null ? `${item.maxDistanceMeters}m` : '指定なし'}
            </Text>
          </DetailRow>

          <DetailRow label="代替品">
            {item.alternativeItemNames.length === 0 ? (
              <Text style={styles.value}>なし</Text>
            ) : (
              item.alternativeItemNames.map((name, index) => (
                <Text key={`${index}-${name}`} style={styles.value}>
                  ・{name}
                </Text>
              ))
            )}
          </DetailRow>

          {item.note !== '' && (
            <DetailRow label="備考">
              <Text style={styles.value}>{item.note}</Text>
            </DetailRow>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {(preferredStoreId !== null || active) && (
          <View style={styles.footerRow}>
            {preferredStoreId !== null ? (
              <ActionButton
                title="ナビゲーション"
                half
                onPress={() => navigation.navigate('Route', { storeId: preferredStoreId })}
                disabled={submitting}
              />
            ) : (
              active && (
                <ActionButton
                  title={searchingStore ? '店舗を探しています…' : '最寄りの店舗へ'}
                  half
                  onPress={handleNavigateNearestStore}
                  disabled={submitting || searchingStore}
                />
              )
            )}
            {active && requesterUserId !== null && (
              <ActionButton
                title="チャット"
                half
                onPress={() =>
                  navigation.navigate('Chat', {
                    familyId,
                    assignmentId,
                    itemName: item.itemName,
                    partnerUserId: requesterUserId,
                  })
                }
                disabled={submitting}
              />
            )}
          </View>
        )}

        {active && (
          <ActionButton
            title="購入した報告"
            variant="primary"
            onPress={() => navigation.navigate('PurchaseReport', { initialItemId: itemId })}
            disabled={submitting}
          />
        )}

        {active && (
          <ActionButton
            title="担当を辞退する"
            variant="danger"
            onPress={confirmCancelAssignment}
            disabled={submitting}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#F7F9FC',
  },
  loadingText: {
    color: '#6b7280',
  },
  loadingBanner: {
    alignSelf: 'stretch',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  banners: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  errorBanner: {
    backgroundColor: '#fdecec',
    borderLeftWidth: 4,
    borderLeftColor: '#fdecec',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
  },
  warningBanner: {
    backgroundColor: '#fff7e6',
    borderLeftWidth: 4,
    borderLeftColor: '#fff7e6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  warningText: {
    color: '#92400e',
    fontSize: 14,
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    gap: 8,
  },
  itemName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryChip: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: '#eef4fc',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#06c',
  },
  importantBadge: {
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: '#c00',
  },
  importantBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  deadline: {
    marginLeft: 'auto',
    fontSize: 13,
    color: '#6b7280',
  },
  deadlineExpired: {
    color: '#c00',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  rowLabel: {
    width: 96,
    color: '#6b7280',
    lineHeight: 22,
  },
  rowValue: {
    flex: 1,
  },
  value: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111827',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8eef5',
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  emptyDescription: {
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dde3ea',
  },
  actionButtonHalf: {
    flex: 1,
  },
  actionButtonPrimary: {
    borderWidth: 0,
    backgroundColor: '#4682b4',
  },
  actionButtonDanger: {
    borderWidth: 0,
    backgroundColor: '#fff5f5',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4682b4',
  },
  actionTitlePrimary: {
    color: '#fff',
  },
  actionTitleDanger: {
    color: '#c00',
  },
});
