import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();

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
        <ActivityIndicator size="large" color="#06c" />
        <Text style={styles.loadingText}>不足品を読み込んでいます…</Text>
        {error !== null && (
          <View style={[styles.errorBanner, styles.loadingBanner]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  //選択された品目を探す。削除された直後は見つからない
  const selectedItem =
    selectedItemId === null ? null : items.find(item => item.id === selectedItemId) ?? null;

  return (
    <View style={styles.container}>
      {error !== null && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyIcon}>🧺</Text>
            </View>
            <Text style={styles.emptyTitle}>不足品はまだありません</Text>
            <Text style={styles.emptyDescription}>
              手で追加するか、冷蔵庫や棚を撮影して検出できます。
            </Text>
            <Button title="不足品を追加する" onPress={() => setCreating(true)} />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => handlePressItem(item)}
          >
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item.itemName}</Text>
              {item.isImportant && (
                <View style={styles.importantBadge}>
                  <Text style={styles.importantBadgeText}>重要</Text>
                </View>
              )}
            </View>
            <Text style={styles.meta}>{itemStateLabel(item)}</Text>
            {item.note !== '' && <Text style={styles.note}>{item.note}</Text>}
          </Pressable>
        )}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
      </View>

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
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 8,
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
  note: {
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
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 4,
  },
});