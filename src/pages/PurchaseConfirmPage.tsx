import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { clearLastPayment, getLastPayment } from '../../modules/paymentNotification';
import type { LastPayment } from '../../modules/paymentNotification';
import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { fetchItems } from '../services/item';
import type { ItemWithId } from '../services/item';
import { failedItemId, reportPurchase } from '../services/itemActions';
import { findPendingAssignments } from '../services/paymentConfirm';
//決済通知から遷移する購入報告画面

type Props = {
  familyId: string;
  uid: string;
};

export default function PurchaseConfirmPage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [lastPayment] = useState<LastPayment | null>(() => getLastPayment());
  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  //担当中の品目を読み込む
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [assignments, allItems] = await Promise.all([
          findPendingAssignments(familyId, uid),
          fetchItems(familyId),
        ]);
        if (cancelled) {
          return;
        }
        const assignedItemIds = new Set(assignments.map(assignment => assignment.itemId));
        const assignedItems = allItems.filter(item => assignedItemIds.has(item.id));
        setItems(assignedItems);

        if (assignedItems.length === 1) {
          setSelectedIds(new Set([assignedItems[0].id]));
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
      const failedId = failedItemId(submitError);
      const failedName = items?.find(item => item.id === failedId)?.itemName;
      const prefix = failedName === undefined ? '' : `「${failedName}」で失敗しました。`;
      setError(`${prefix}${errorMessage(submitError, 'reportPurchase')}`);
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
        <ActivityIndicator size="large" />
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>決済を検知しました</Text>
      <Text style={styles.paymentText} numberOfLines={1}>
        {lastPayment?.text ?? ''}
      </Text>

      <Text style={styles.note}>購入した品目を選んでください。</Text>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>担当中の品目はありません。</Text>}
        renderItem={({ item }) => {
          const selected = selectedIds.has(item.id);
          return (
            <Pressable
              style={[styles.item, selected && styles.itemSelected]}
              onPress={() => handlePressItem(item)}
              disabled={submitting}
            >
              <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                {selected && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.itemName}>{item.itemName}</Text>
            </Pressable>
          );
        }}
      />

      <Button
        title="購入した"
        onPress={handleConfirm}
        disabled={submitting || selectedIds.size === 0}
      />
      <Button title="違う" color="#c00" onPress={handleReject} disabled={submitting} />
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
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  paymentText: {
    color: '#666',
  },
  note: {
    color: '#666',
  },
  list: {
    gap: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
  },
  itemSelected: {
    borderColor: '#06c',
    backgroundColor: '#eaf2fb',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: '#06c',
    backgroundColor: '#06c',
  },
  checkmark: {
    color: '#fff',
    fontWeight: 'bold',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
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