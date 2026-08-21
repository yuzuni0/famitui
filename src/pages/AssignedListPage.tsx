import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { isExpired, observeMyAssignments, remainingMillis } from '../services/assignment';
import type { AssignmentWithId } from '../services/assignment';
import { observeItems } from '../services/item';
import type { ItemWithId } from '../services/item';
import { CATEGORIES } from '../types/firestore';
import type { CategoryId } from '../types/firestore';

//自分が担当している品目をまとめて確認する画面
type Props = {
  familyId: string;
  uid: string;
};

function categoryLabel(category: CategoryId): string {
  return CATEGORIES.find(entry => entry.id === category)?.label ?? category;
}

//期限までの残りを文字列にする
function remainingLabel(assignment: AssignmentWithId): string {
  if (isExpired(assignment)) {
    return '期限切れ';
  }

  const minutes = Math.floor(remainingMillis(assignment) / 60000);
  return minutes < 1 ? 'まもなく期限' : `残り${minutes}分`;
}

//期限が近いものを上に出す
function sortByExpireTime(assignments: AssignmentWithId[]): AssignmentWithId[] {
  return [...assignments].sort((a, b) => a.expireTime.toMillis() - b.expireTime.toMillis());
}

export default function AssignedListPage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

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
        <ActivityIndicator size="large" />
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={sortedAssignments}
        keyExtractor={assignment => assignment.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>担当している品目はありません。</Text>
            <Button title="不足品の一覧" onPress={() => navigation.navigate('ItemList')} />
          </View>
        }
        renderItem={({ item: assignment }) => {
          //品目が削除された直後は見つからない
          const item = itemsById.get(assignment.itemId) ?? null;
          const expired = isExpired(assignment);

          return (
            <Pressable
              style={styles.item}
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
  },
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
  },
  list: {
    gap: 12,
  },
  item: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    gap: 4,
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
  emptyBox: {
    gap: 12,
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