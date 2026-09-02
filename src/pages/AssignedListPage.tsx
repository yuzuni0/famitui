import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../lib/errors';
import { categoryLabel } from '../lib/format';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { isExpired, observeMyAssignments, remainingLabel } from '../services/assignment';
import type { AssignmentWithId } from '../services/assignment';
import { observeItems } from '../services/item';
import type { ItemWithId } from '../services/item';

//自分が担当している品目をまとめて確認する画面
type Props = {
  familyId: string;
  uid: string;
};

//期限が近いものを上に出す
function sortByExpireTime(assignments: AssignmentWithId[]): AssignmentWithId[] {
  return [...assignments].sort((a, b) => a.expireTime.toMillis() - b.expireTime.toMillis());
}

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

  //期限の近い順に並べ替える
  const sortedAssignments = useMemo(
    () => (assignments === null ? [] : sortByExpireTime(assignments)),
    [assignments],
  );

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

      <FlatList
        data={sortedAssignments}
        keyExtractor={assignment => assignment.id}
        contentContainerStyle={[styles.list, { paddingBottom: 16 + insets.bottom }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyIcon}>✅</Text>
            </View>
            <Text style={styles.emptyTitle}>担当している品目はありません</Text>
            <Text style={styles.emptyDescription}>
              不足品の一覧で依頼を受け付けると、ここに表示されます。
            </Text>
            <Button title="不足品の一覧を見る" onPress={() => navigation.navigate('ItemList')} />
          </View>
        }
        renderItem={({ item: assignment }) => {
          //品目が削除された直後は見つからない
          const item = itemsById.get(assignment.itemId) ?? null;
          const expired = isExpired(assignment);

          return (
            <Pressable
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={() => navigation.navigate('AssignmentDetail', { itemId: assignment.itemId })}
            >
              <Text style={styles.itemName}>{item?.itemName ?? '削除された品目'}</Text>
              {item !== null && <Text style={styles.meta}>{categoryLabel(item.category)}</Text>}
              <Text style={expired ? styles.expired : styles.meta}>
                {remainingLabel(assignment)}
              </Text>
            </Pressable>
          );
        }}
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
  errorBanner: {
    backgroundColor: '#fdecec',
    borderLeftWidth: 4,
    borderLeftColor: '#c00',
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
  expired: {
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
});