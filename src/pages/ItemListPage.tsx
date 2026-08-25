import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import AddMissingModal from './AddMissingModal';
import { itemStateLabel, observeItems } from '../services/item';
import type { ItemWithId } from '../services/item';
import { CATEGORIES } from '../types/firestore';

type Props = {
  familyId: string;
  uid: string;
};

//カテゴリごとの枠を表す
type ItemSection = {
  title: string;
  data: ItemWithId[];
};

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

export default function ItemListPage({ familyId, uid }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  //不足品を監視する
  useEffect(() => {
    //家族グループが変わった時は取得前の状態に戻す
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

  //不足品をタップした時はモーダルを開く
  function handlePressItem(item: ItemWithId) {
    setSelectedItemId(item.id);
  }

  //モーダルを閉じる時の処理
  function handleCloseModal() {
    setSelectedItemId(null);
    setCreating(false);
  }

  //items が変わった時にカテゴリの枠を作る
  const sections = useMemo(() => (items === null ? [] : buildSections(items)), [items]);

  if (items === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  //選択された品目を探す。削除された直後は見つからない
  const selectedItem =
    selectedItemId === null ? null : items.find(item => item.id === selectedItemId) ?? null;

  return (
    <View style={styles.container}>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <Text style={styles.empty}>不足品はまだ登録されていません。</Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable style={styles.item} onPress={() => handlePressItem(item)}>
            <Text style={styles.itemName}>{item.itemName}</Text>
            <Text style={styles.meta}>{itemStateLabel(item)}</Text>
            {item.note !== '' && <Text style={styles.note}>{item.note}</Text>}
          </Pressable>
        )}
      />

      <Button title="不足品を追加する" onPress={() => setCreating(true)} />

      {/* 撮影画面に遷移するボタン */}
      <Button
        title="基準を登録する"
        onPress={() => navigation.navigate('Camera', { mode: 'baseline' })}
      />

      <Button
        title="不足品を検出する"
        onPress={() => navigation.navigate('Camera', { mode: 'detect' })}
      />

      {(creating || selectedItem !== null) && (
        <AddMissingModal
          //対象が変わった時に入力欄の状態を作り直す
          key={creating ? 'new' : selectedItem?.id}
          familyId={familyId}
          uid={uid}

          item={creating ? null : selectedItem}
          onClose={handleCloseModal}
        />
      )}
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
