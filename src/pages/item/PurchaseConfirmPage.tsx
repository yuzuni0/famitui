import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearLastPayment } from '../../../modules/paymentNotification';
import { errorMessage } from '../../lib/errors';
import { groupByCategory } from '../../lib/format';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { fetchItems, isAssigned, isAssignedTo, itemStateLabel } from '../../services/firestore/item';
import type { ItemWithId } from '../../services/firestore/item';
import { failedItemMessage, reportPurchase } from '../../services/functions/itemActions';
//決済通知から遷移する購入報告画面

type Props = {
  familyId: string;
  uid: string;
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

export default function PurchaseConfirmPage({ familyId, uid }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  //担当中の品目を読み込む
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const allItems = await fetchItems(familyId);
        if (cancelled) {
          return;
        }
        const purchasable = allItems.filter(
          item => item.status !== 'completed' && (!isAssigned(item) || isAssignedTo(item, uid)),
        );
        setItems(purchasable);

        const mine = purchasable.filter(item => isAssignedTo(item, uid));
        if (mine.length === 1) {
          setSelectedIds(new Set([mine[0].id]));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [familyId, uid]);

  useEffect(() => {
    return () => {
      clearLastPayment();
    };
  }, []);

  //カテゴリごとに分ける
  const sections = useMemo(
    () => (items === null ? [] : groupByCategory(items, item => item.category)),
    [items],
  );

  function handlePressItem(item: ItemWithId) {
    if (submitting) {
      return;
    }

    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
  }

  //選んだ品目の購入を報告する
  async function handleConfirm() {
    if (submitting || selectedIds.size === 0) {
      return;
    }

    setError(null);
    setSubmitting(true);

    let result;
    try {
      result = await reportPurchase(familyId, [...selectedIds]);
    } catch (submitError) {
      setError(failedItemMessage(submitError, 'reportPurchase', items ?? []));
      setSubmitting(false);
      return;
    }

    clearLastPayment();

    const { previousLevel, newLevel, addedScore } = result;
    if (newLevel > previousLevel) {
      navigation.replace('LevelUp', { previousLevel, newLevel, addedScore });
      return;
    }

    navigation.popTo('Home');
  }

  //依頼品と関係ない購入の場合
  function handleReject() {
    if (submitting) {
      return;
    }
    clearLastPayment();
    navigation.popTo('Home');
  }

  if (items === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#06c" />
        <Text style={styles.loadingText}>品目を読み込んでいます…</Text>
        {error !== null && (
          <View style={[styles.errorBanner, styles.loadingBanner]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  const selectedCount = selectedIds.size;

  return (
    <View style={styles.container}>
      <Text style={styles.paymentTitle}>決済を検知しました</Text>

      <Text style={styles.guide}>この決済で購入した品目を選んでください。</Text>

      {error !== null && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        style={styles.listContainer}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>購入できる品目はありません</Text>
            <Text style={styles.emptyNote}>不足品を追加するか、依頼を受け付けてから報告できます。</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const selected = selectedIds.has(item.id);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.item,
                selected && styles.itemSelected,
                pressed && styles.itemPressed,
              ]}
              onPress={() => handlePressItem(item)}
              disabled={submitting}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.itemBody}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.itemName}</Text>
                  {item.isImportant && (
                    <View style={styles.importantBadge}>
                      <Text style={styles.importantBadgeText}>重要</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>{itemStateLabel(item)}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {submitting ? (
          <View style={[styles.actionButton, styles.actionButtonPrimary]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <ActionButton
            title={selectedCount === 0 ? '購入した' : `購入した（${selectedCount}件）`}
            primary
            disabled={selectedCount === 0}
            onPress={handleConfirm}
          />
        )}
        <ActionButton title="依頼品ではない" disabled={submitting} onPress={handleReject} />
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
  paymentTitle: {
    marginHorizontal: 16,
    marginTop: 16,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  guide: {
    marginHorizontal: 16,
    marginTop: 12,
    color: '#6b7280',
    lineHeight: 20,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: '#fdecec',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  topBanner: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: -7,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemSelected: {
    borderColor: '#06c',
    backgroundColor: '#eef4fc',
  },
  itemPressed: {
    opacity: 0.7,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxSelected: {
    borderColor: '#4682b4',
    backgroundColor: '#4682b4',
  },
  checkmark: {
    color: '#fff',
    fontWeight: 'bold',
  },
  itemBody: {
    flex: 1,
    gap: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  meta: {
    color: '#6b7280',
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
  empty: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  emptyNote: {
    color: '#6b7280',
    textAlign: 'center',
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