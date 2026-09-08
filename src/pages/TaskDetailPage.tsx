import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../lib/errors';
import { categoryLabel } from '../lib/format';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { isExpired, observeAssignment, remainingLabel } from '../services/assignment';
import type { AssignmentWithId } from '../services/assignment';
import { observeItems } from '../services/item';
import type { ItemWithId } from '../services/item';
import { cancelAssignment } from '../services/itemActions';
import { observeMembers } from '../services/member';
import type { MemberWithId } from '../services/member';
import { observeStores } from '../services/store';
import type { StoreWithId } from '../services/store';

//担当している不足品の詳細を表示し、ナビとかに遷移するための画面
type Props = {
  familyId: string;
  uid: string;
  itemId: string;
};

export default function TaskDetailPage({ familyId, uid, itemId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [members, setMembers] = useState<MemberWithId[] | null>(null);
  const [stores, setStores] = useState<StoreWithId[] | null>(null);
  const [assignment, setAssignment] = useState<AssignmentWithId | null>(null);
  const [assignmentLoaded, setAssignmentLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const unsubscribe = observeStores(familyId, setStores);
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
          <Button title="閉じる" onPress={() => navigation.goBack()} />
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

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>商品名</Text>
          <Text style={styles.itemName}>{item.itemName}</Text>

          <Text style={styles.label}>カテゴリ</Text>
          <Text style={styles.value}>{categoryLabel(item.category)}</Text>

          <Text style={styles.label}>代替品</Text>
          {item.alternativeItemNames.length === 0 ? (
            <Text style={styles.value}>なし</Text>
          ) : (
            item.alternativeItemNames.map((name, index) => (
              <Text key={`${index}-${name}`} style={styles.value}>
                ・{name}
              </Text>
            ))
          )}

          <Text style={styles.label}>距離の上限（メートル）</Text>
          <Text style={styles.value}>
            {item.maxDistanceMeters != null ? String(item.maxDistanceMeters) : '指定なし'}
          </Text>

          <Text style={styles.label}>購入する店舗</Text>
          <Text style={styles.value}>{preferredStoreName}</Text>

          {item.note !== '' && (
            <>
              <Text style={styles.label}>備考</Text>
              <Text style={styles.value}>{item.note}</Text>
            </>
          )}

          <Text style={styles.label}>依頼者</Text>
          <Text style={styles.value}>{requesterName}</Text>

          <Text style={styles.label}>期限</Text>
          <Text style={isExpired(assignment) ? styles.expired : styles.value}>
            {remainingLabel(assignment)}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {preferredStoreId !== null && (
          <Button
            title="ナビゲーション"
            onPress={() => navigation.navigate('Route', { storeId: preferredStoreId })}
            disabled={submitting}
          />
        )}

        {active && (
          <>
            {requesterUserId !== null && (
              <Button
                title="チャット"
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
            <Button
              title="購入した報告"
              onPress={() => navigation.navigate('PurchaseReport', { initialItemId: itemId })}
              disabled={submitting}
            />
            <Button
              title="担当を辞退する"
              color="#c00"
              onPress={confirmCancelAssignment}
              disabled={submitting}
            />
          </>
        )}
        <Button title="閉じる" onPress={() => navigation.goBack()} disabled={submitting} />
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
    backgroundColor: '#f4f6f8',
  },
  loadingText: {
    color: '#6b7280',
  },
  loadingBanner: {
    alignSelf: 'stretch',
  },
  container: {
    flex: 1,
    backgroundColor: '#f4f6f8',
  },
  banners: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  errorBanner: {
    backgroundColor: '#fdecec',
    borderLeftWidth: 4,
    borderLeftColor: '#c00',
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
    borderLeftColor: '#d97706',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  warningText: {
    color: '#92400e',
    fontSize: 14,
    lineHeight: 20,
  },
  content: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    marginTop: 12,
    color: '#6b7280',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  value: {
    fontSize: 16,
    color: '#111827',
  },
  expired: {
    fontSize: 16,
    color: '#c00',
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
    paddingTop: 8,
    gap: 4,
  },
});