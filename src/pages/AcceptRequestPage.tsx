import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { isAssigned, itemStateLabel, observeItems } from '../services/item';
import type { ItemWithId } from '../services/item';
import { approveRequest, failedItemId } from '../services/itemActions';
import { CATEGORIES } from '../types/firestore';

//依頼を受け付ける品目をまとめて選ぶ画面

type Props = {
  familyId: string;
  //ナビゲーション画面へ渡すために受け取る
  uid: string;
  initialItemId: string;
};

//カテゴリごとの枠を表す
type ItemSection = {
  title: string;
  data: ItemWithId[];
};

//受け付けられる品目かどうかを判定する
//依頼が無い不足品もそのまま担当できる
function isAcceptable(item: ItemWithId): boolean {
  return item.status !== 'completed' && !isAssigned(item);
}

function buildSections(items: ItemWithId[]): ItemSection[] {
  const sections: ItemSection[] = [];

  for (const entry of CATEGORIES) {
    const data = items.filter(item => item.category === entry.id);
    if (data.length === 0) {
      continue;
    }
    sections.push({ title: entry.label, data });
  }

  return sections;
}

export default function AcceptRequestPage({ familyId, initialItemId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set([initialItemId]));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  //不足品をカテゴリごとに分ける
  const sections = useMemo(
    () => (items === null ? [] : buildSections(items.filter(isAcceptable))),
    [items],
  );

  //一覧から消えた品目は数に入れない
  const selectedCount = useMemo(
    () =>
      items === null
        ? 0
        : items.filter(item => selectedIds.has(item.id) && isAcceptable(item)).length,
    [items, selectedIds],
  );

  //移動元で選んだ品目が一覧に出ない場合に知らせる
  const initialItemMissing =
    items !== null &&
    !submitting &&
    !items.some(item => item.id === initialItemId && isAcceptable(item));

  //選択と解除を切り替える
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

  //選んだ不足品をまとめて承認する
  async function handleSubmit() {
    if (submitting || items === null) {
      return;
    }

    //一覧から消えた品目を対象から外す
    const targets = items.filter(item => selectedIds.has(item.id) && isAcceptable(item));
    if (targets.length === 0) {
      setError('品目を1つ以上選んでください。');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await approveRequest(familyId, targets.map(item => item.id));
    } catch (submitError) {
      //既に成功した品目は担当中のまま残す
      const failedId = failedItemId(submitError);
      const failedName = targets.find(item => item.id === failedId)?.itemName;
      const prefix = failedName === undefined ? '' : `「${failedName}」で失敗しました。`;
      setError(`${prefix}${errorMessage(submitError, 'approveRequest')}`);
      setSubmitting(false);
      return;
    }

    navigation.navigate('ItemList');
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
      <Text style={styles.note}>一緒に買う品目を選んでください。</Text>

      {initialItemMissing && (
        <Text style={styles.error}>
          選んだ品目は今は受け付けられません。他の人が担当を始めたか、完了した可能性があります。
        </Text>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <Text style={styles.empty}>受け付けられる品目はありません。</Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const selected = selectedIds.has(item.id);
          return (
            <Pressable
              style={[styles.item, selected && styles.itemSelected]}
              onPress={() => handlePressItem(item)}
              disabled={submitting}
            >
              <Text style={styles.itemName}>{item.itemName}</Text>
              <Text style={styles.meta}>{itemStateLabel(item)}</Text>
              {item.note !== '' && <Text style={styles.note}>{item.note}</Text>}
            </Pressable>
          );
        }}
      />

      <Button
        title={`受け付ける（${selectedCount}件）`}
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