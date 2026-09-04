import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { isExpired, observeMyAssignments, remainingLabel } from '../services/assignment';
import type { AssignmentWithId } from '../services/assignment';
import { observeItems } from '../services/item';
import type { ItemWithId } from '../services/item';
import { failedItemId, reportPurchase } from '../services/itemActions';
import { CATEGORIES } from '../types/firestore';

//担当中の不足品の購入をまとめて報告する画面

type Props = {
  familyId: string;
  uid: string;
  initialItemId: string;
};

//割り当てと品目のまとまり
type AssignedItem = {
  assignment: AssignmentWithId;
  item: ItemWithId;
};

//カテゴリごとの枠を表示する
type ItemSection = {
  title: string;
  data: AssignedItem[];
};

//割り当てに対応する品目をまとまりにする
function buildAssignedItems(
  assignments: AssignmentWithId[],
  items: ItemWithId[],
): AssignedItem[] {
  const itemsById = new Map<string, ItemWithId>();
  for (const item of items) {
    itemsById.set(item.id, item);
  }

  const assignedItems: AssignedItem[] = [];
  for (const assignment of assignments) {
    const item = itemsById.get(assignment.itemId);
    if (item === undefined) {
      continue;
    }
    assignedItems.push({ assignment, item });
  }

  return assignedItems;
}

//期限が近いものを上に出す
function sortByExpireTime(assignedItems: AssignedItem[]): AssignedItem[] {
  return [...assignedItems].sort(
    (a, b) => a.assignment.expireTime.toMillis() - b.assignment.expireTime.toMillis(),
  );
}

function buildSections(assignedItems: AssignedItem[]): ItemSection[] {
  const sections: ItemSection[] = [];

  for (const entry of CATEGORIES) {
    const data = assignedItems.filter(assigned => assigned.item.category === entry.id);
    if (data.length === 0) {
      continue;
    }
    sections.push({ title: entry.label, data: sortByExpireTime(data) });
  }

  return sections;
}

export default function PurchaseReportPage({ familyId, uid, initialItemId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

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

  //担当中の品目だけを対象にする
  const assignedItems = useMemo(
    () =>
      assignments === null || items === null ? [] : buildAssignedItems(assignments, items),
    [assignments, items],
  );

  //担当中の品目をカテゴリごとに分ける
  const sections = useMemo(() => buildSections(assignedItems), [assignedItems]);

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

    try {
      await reportPurchase(familyId, targets.map(assigned => assigned.item.id));
    } catch (submitError) {
      //成功した品目を除外する
      const failedId = failedItemId(submitError);
      const failedName = targets.find(assigned => assigned.item.id === failedId)?.item.itemName;
      const prefix = failedName === undefined ? '' : `「${failedName}」で失敗しました。`;
      setError(`${prefix}${errorMessage(submitError, 'reportPurchase')}`);
      setSubmitting(false);
      return;
    }

    navigation.popTo('AssignedList');
  }

  if (assignments === null || items === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.note}>一緒に買った品目を選んでください。</Text>

      {initialItemMissing && (
        <Text style={styles.error}>
          選んだ品目は今は報告できません。他の人が担当を始めたか、完了した可能性があります。
        </Text>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <SectionList
        sections={sections}
        keyExtractor={assigned => assigned.item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <Text style={styles.empty}>はありません。</Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item: assigned }) => {
          const selected = selectedIds.has(assigned.item.id);
          const expired = isExpired(assigned.assignment);

          return (
            <Pressable
              style={[styles.item, selected && styles.itemSelected]}
              onPress={() => handlePressItem(assigned)}
              disabled={submitting}
            >
              <Text style={styles.itemName}>{assigned.item.itemName}</Text>
              <Text style={expired ? styles.expired : styles.meta}>
                {remainingLabel(assigned.assignment)}
              </Text>
            </Pressable>
          );
        }}
      />

      <Button
        title={`報告する（${selectedCount}件）`}
        onPress={handleSubmit}
        disabled={submitting}
      />
      <Button title="やめる" onPress={() => navigation.goBack()} disabled={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
  },
  list: {
    gap: 12,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    backgroundColor: '#fff',
  },
  item: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    gap: 4,
  },
  itemSelected: {
    borderColor: '#06c',
    backgroundColor: '#eaf2fb',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  meta: {
    color: '#666',
  },
  expired: {
    color: '#c00',
  },
  note: {
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    color: '#666',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});