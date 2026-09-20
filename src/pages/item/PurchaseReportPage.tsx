import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/errors';
import { groupByCategory } from '../../lib/format';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { isExpired, observeMyAssignments, remainingLabel, sortByExpireTime } from '../../services/firestore/assignment';
import type { AssignmentWithId } from '../../services/firestore/assignment';
import { isAssigned, itemStateLabel, observeItems } from '../../services/firestore/item';
import type { ItemWithId } from '../../services/firestore/item';
import { failedItemMessage, reportPurchase } from '../../services/functions/itemActions';

//担当中の不足品の購入をまとめて報告する画面

type Props = {
  familyId: string;
  uid: string;
  initialItemId: string;
};

//割り当てと品目のまとまり。担当していない不足品は割り当てが無い
type AssignedItem = {
  assignment: AssignmentWithId | null;
  item: ItemWithId;
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

function buildAssignedItems(
  assignments: AssignmentWithId[],
  items: ItemWithId[],
): AssignedItem[] {
  const itemsById = new Map<string, ItemWithId>();
  for (const item of items) {
    itemsById.set(item.id, item);
  }

  const assignedItems: AssignedItem[] = [];
  const listedIds = new Set<string>();
  for (const assignment of assignments) {
    const item = itemsById.get(assignment.itemId);
    if (item === undefined) {
      continue;
    }
    assignedItems.push({ assignment, item });
    listedIds.add(item.id);
  }

  for (const item of items) {
    if (listedIds.has(item.id) || item.status === 'completed' || isAssigned(item)) {
      continue;
    }
    assignedItems.push({ assignment: null, item });
  }

  return assignedItems;
}

export default function PurchaseReportPage({ familyId, uid, initialItemId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [assignments, setAssignments] = useState<AssignmentWithId[] | null>(null);
  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set([initialItemId]));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  //自分の担当中の割り当てを監視する
  useEffect(() => {
    setAssignments(null);
    setError(null);

    const unsubscribe = observeMyAssignments(
      familyId,
      uid,
      nextAssignments => {
        setAssignments(nextAssignments);
        setError(null);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId, uid]);

  //担当の品目名を表示するために監視する
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

  //担当中の品目と依頼品を対象にする
  const assignedItems = useMemo(
    () =>
      assignments === null || items === null
        ? []
        : buildAssignedItems(sortByExpireTime(assignments), items),
    [assignments, items],
  );

  //カテゴリごとに分ける
  const sections = useMemo(
    () => groupByCategory(assignedItems, assigned => assigned.item.category),
    [assignedItems],
  );

  const selectedCount = useMemo(
    () => assignedItems.filter(assigned => selectedIds.has(assigned.item.id)).length,
    [assignedItems, selectedIds],
  );

  //担当の品目が一覧から消えた時に報告する
  const initialItemMissing =
    assignments !== null &&
    items !== null &&
    !submitting &&
    !assignedItems.some(assigned => assigned.item.id === initialItemId);

  //選択と解除の状態を切り替える
  function handlePressItem(assigned: AssignedItem) {
    if (submitting) {
      return;
    }

    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(assigned.item.id)) {
        next.delete(assigned.item.id);
      } else {
        next.add(assigned.item.id);
      }
      return next;
    });
  }

  //選んだ品目の購入をまとめて報告する
  async function handleSubmit() {
    if (submitting) {
      return;
    }

    //一覧から消えた品目を対象から外す
    const targets = assignedItems.filter(assigned => selectedIds.has(assigned.item.id));
    if (targets.length === 0) {
      setError('品目を1つ以上選んでください。');
      return;
    }

    setError(null);
    setSubmitting(true);

    let result;
    try {
      result = await reportPurchase(familyId, targets.map(assigned => assigned.item.id));
    } catch (submitError) {
      //成功した品目を除外する
      setError(
        failedItemMessage(submitError, 'reportPurchase', targets.map(assigned => assigned.item)),
      );
      setSubmitting(false);
      return;
    }

    //レベルアップ画面への遷移
    const { previousLevel, newLevel, addedScore } = result;
    if (newLevel > previousLevel) {
      navigation.replace('LevelUp', { previousLevel, newLevel, addedScore });
      return;
    }

    navigation.popTo('AssignedList');
  }

  if (assignments === null || items === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#06c" />
        <Text style={styles.loadingText}>担当中の品目を読み込んでいます…</Text>
        {error !== null && (
          <View style={[styles.errorBanner, styles.loadingBanner]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.guide}>一緒に買った品目を選んでください。</Text>

      {initialItemMissing && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>
            選んだ品目は今は報告できません。他の人が担当を始めたか、完了した可能性があります。
          </Text>
        </View>
      )}

      {error !== null && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={assigned => assigned.item.id}
        style={styles.listContainer}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>購入できる品目はありません</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item: assigned }) => {
          const selected = selectedIds.has(assigned.item.id);
          const expired = assigned.assignment !== null && isExpired(assigned.assignment);

          return (
            <Pressable
              style={({ pressed }) => [
                styles.item,
                selected && styles.itemSelected,
                pressed && styles.itemPressed,
              ]}
              onPress={() => handlePressItem(assigned)}
              disabled={submitting}
            >
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{assigned.item.itemName}</Text>
                {assigned.item.isImportant && (
                  <View style={styles.importantBadge}>
                    <Text style={styles.importantBadgeText}>重要</Text>
                  </View>
                )}
              </View>
              <Text style={expired ? styles.expired : styles.meta}>
                {assigned.assignment === null
                  ? itemStateLabel(assigned.item)
                  : remainingLabel(assigned.assignment)}
              </Text>
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
            title={`報告する（${selectedCount}件）`}
            primary
            disabled={false}
            onPress={handleSubmit}
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
  guide: {
    marginHorizontal: 16,
    marginTop: 16,
    color: '#6b7280',
    lineHeight: 20,
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
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: 16,
    gap: 4,
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
  meta: {
    color: '#6b7280',
  },
  expired: {
    color: '#c00',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
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
