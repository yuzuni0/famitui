import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/errors';
import { groupByCategory } from '../../lib/format';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { observeMyAssignments, remainingLabel, sortByExpireTime } from '../../services/firestore/assignment';
import type { AssignmentWithId } from '../../services/firestore/assignment';
import { observeItems } from '../../services/firestore/item';
import type { ItemWithId } from '../../services/firestore/item';

//自分が担当している品目をまとめて確認する画面
type Props = {
  familyId: string;
  uid: string;
};

export default function AssignedListPage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [assignments, setAssignments] = useState<AssignmentWithId[] | null>(null);
  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  //自分の割り当てを監視する
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

  //自分の担当品目を監視する
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

  //IDから不足品を特定する
  const itemsById = useMemo(() => {
    const map = new Map<string, ItemWithId>();
    if (items !== null) {
      for (const item of items) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [items]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (assignments === null) {
      return;
    }
    const next = Math.min(
      ...assignments.map(assignment => assignment.expireTime.toMillis()).filter(time => time > now),
    );
    if (!Number.isFinite(next)) {
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), next - now);
    return () => clearTimeout(timer);
  }, [assignments, now]);

  //期限の近い順に並べる
  const sections = useMemo(() => {
    if (assignments === null) {
      return [];
    }
    const active = assignments.filter(assignment => assignment.expireTime.toMillis() > now);
    const rows = sortByExpireTime(active).map(assignment => ({
      assignment,
      item: itemsById.get(assignment.itemId) ?? null,
    }));
    const withItem = rows.filter(row => row.item !== null);
    const result = groupByCategory(withItem, row => row.item!.category);
    const deleted = rows.filter(row => row.item === null);
    if (deleted.length > 0) {
      result.push({ title: '削除された品目', data: deleted });
    }
    return result;
  }, [assignments, itemsById, now]);

  if (assignments === null || items === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#06c" />
        <Text style={styles.loadingText}>担当している品目を読み込んでいます…</Text>
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
      {error !== null && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={row => row.assignment.id}
        contentContainerStyle={[styles.list, { paddingBottom: 16 + insets.bottom }]}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>担当している品目はありません</Text>
            <Text style={styles.emptyDescription}>
              不足品の一覧で依頼を受け付けると、ここに表示されます。
            </Text>
            <Pressable
              style={({ pressed }) => [styles.emptyButton, pressed && styles.itemPressed]}
              onPress={() => navigation.navigate('ItemList')}
            >
              <Text style={styles.emptyButtonText}>不足品の一覧を見る</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item: { assignment, item } }) => (
          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => navigation.navigate('AssignmentDetail', { itemId: assignment.itemId })}
          >
            <Text style={styles.itemName}>{item?.itemName ?? '削除された品目'}</Text>
            <Text style={styles.meta}>{remainingLabel(assignment)}</Text>
          </Pressable>
        )}
      />
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
  errorBanner: {
    backgroundColor: '#fdecec',
    borderLeftWidth: 4,
    borderLeftColor: '#fdecec',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  topBanner: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
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
    padding: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemPressed: {
    opacity: 0.7,
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  meta: {
    color: '#6b7280',
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
  emptyButton: {
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 999,
    backgroundColor: '#4682b4',
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
  },
});
