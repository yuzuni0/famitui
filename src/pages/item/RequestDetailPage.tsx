import { StackActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/errors';
import { categoryLabel, formatDateTime } from '../../lib/format';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { isAssigned, itemStateLabel, observeItems } from '../../services/firestore/item';
import type { ItemWithId } from '../../services/firestore/item';
import { observeMembers } from '../../services/firestore/member';
import type { MemberWithId } from '../../services/firestore/member';
import { observeStores } from '../../services/firestore/store';
import type { StoreWithId } from '../../services/firestore/store';

//依頼の内容を確認し、受け付ける品目に加える画面
type Props = {
  familyId: string;
  uid: string;
  itemId: string;
  selected: boolean;
};

type ActionButtonProps = {
  title: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
};

function ActionButton({ title, primary = false, disabled, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        pressed && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      <Text style={[styles.actionTitle, primary && styles.actionTitlePrimary]}>{title}</Text>
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

export default function RequestDetailPage({ familyId, uid, itemId, selected }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [members, setMembers] = useState<MemberWithId[] | null>(null);
  const [stores, setStores] = useState<StoreWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  //依頼者の表示名を取得する
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

  //購入する店舗の名前を表示する
  useEffect(() => {
    setStores(null);
    const unsubscribe = observeStores(familyId, setStores, observeError => {
      setError(errorMessage(observeError));
    });
    return unsubscribe;
  }, [familyId]);

  const item = useMemo(
    () => (items === null ? null : items.find(entry => entry.id === itemId) ?? null),
    [items, itemId],
  );


  const requesterName = useMemo(() => {
    if (item === null || item.requesterUserId === null) {
      return '依頼なし';
    }
    return (
      members?.find(member => member.id === item.requesterUserId)?.displayName ??
      item.requesterUserId
    );
  }, [item, members]);

  //購入する店舗の名前を取得
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

  //受付一覧へ戻り、受け付けの結果を返す
  function handleToggleAccept() {
    navigation.dispatch(
      StackActions.popTo(
        'AcceptRequest',
        { selection: { itemId, accepted: !selected } },
        { merge: true },
      ),
    );
  }

  if (items === null || members === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#06c" />
        <Text style={styles.loadingText}>依頼の内容を読み込んでいます…</Text>
        {error !== null && (
          <View style={[styles.errorBanner, styles.loadingBanner]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  if (item === null) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIcon}>❓</Text>
          </View>
          <Text style={styles.emptyTitle}>品目が見つかりません</Text>
          <Text style={styles.emptyDescription}>この品目は削除された可能性があります。</Text>
        </View>
      </View>
    );
  }
  
  const acceptable = item.status !== 'completed' && !isAssigned(item);
  const rejectedBefore = item.rejectedUserIds.includes(uid);

  return (
    <View style={styles.container}>
      {(error !== null || !acceptable || rejectedBefore) && (
        <View style={styles.banners}>
          {error !== null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {!acceptable && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                この品目は今は受け付けられません。他の人が担当を始めたか、完了した可能性があります。
              </Text>
            </View>
          )}
          {acceptable && rejectedBefore && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>以前に担当を辞退した品目です。</Text>
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
              <Text style={styles.state}>{itemStateLabel(item)}</Text>
            </View>
          </View>

          <DetailRow label="依頼者">
            <Text style={styles.value}>{requesterName}</Text>
          </DetailRow>

          {item.requestedTime !== null && (
            <DetailRow label="依頼日時">
              <Text style={styles.value}>{formatDateTime(item.requestedTime)}</Text>
            </DetailRow>
          )}

          <DetailRow label="購入する店舗">
            <Text style={styles.value}>{preferredStoreName}</Text>
          </DetailRow>

          <DetailRow label="距離の上限">
            <Text style={styles.value}>
              {item.maxDistanceMeters !== null ? `${item.maxDistanceMeters}m` : '指定なし'}
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
        {selected ? (
          <ActionButton title="受け付けをやめる" disabled={false} onPress={handleToggleAccept} />
        ) : (
          <ActionButton
            title="受け付ける"
            primary
            disabled={!acceptable}
            onPress={handleToggleAccept}
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
  state: {
    marginLeft: 'auto',
    fontSize: 13,
    color: '#6b7280',
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
  actionButtonPrimary: {
    borderWidth: 0,
    backgroundColor: '#4682b4',
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
});
