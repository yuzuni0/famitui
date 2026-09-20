import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/errors';
import { groupByCategory } from '../../lib/format';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { isAssigned, itemStateLabel, observeItems } from '../../services/firestore/item';
import type { ItemWithId } from '../../services/firestore/item';
import { approveRequest, failedItemMessage } from '../../services/functions/itemActions';

//受け付けた品目をまとめて選ぶ画面

type Props = {
  familyId: string;
  uid: string;
  initialItemIds: string[];
  detected: boolean;
  //詳細画面で受け付けた結果
  selection?: { itemId: string; accepted: boolean };
};

type Section = {
  group: 'detected' | 'rest';
  groupTitle: string;
  groupCount: number;
  first: boolean;
  title: string;
  data: ItemWithId[];
};

type ActionButtonProps = {
  title: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
};

//依頼が無い不足品もそのまま担当できる
function isAcceptable(item: ItemWithId): boolean {
  return item.status !== 'completed' && !isAssigned(item);
}

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

export default function AcceptRequestPage({ familyId, initialItemIds, detected, selection }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
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

  //詳細画面で受け付けた結果を反映する
  useEffect(() => {
    if (selection === undefined) {
      return;
    }
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (selection.accepted) {
        next.add(selection.itemId);
      } else {
        next.delete(selection.itemId);
      }
      return next;
    });
  }, [selection]);

  //検知した品目と残りの品目に分ける
  const sections = useMemo<Section[]>(() => {
    if (items === null) {
      return [];
    }
    const acceptable = items.filter(isAcceptable);
    const initial = new Set(initialItemIds);

    const toSections = (
      group: Section['group'],
      groupTitle: string,
      entries: ItemWithId[],
    ): Section[] =>
      groupByCategory(entries, item => item.category).map((section, index) => ({
        group,
        groupTitle,
        groupCount: entries.length,
        first: index === 0,
        title: section.title,
        data: section.data,
      }));

    return [
      ...toSections(
        'detected',
        detected ? '検知した品目' : '選んだ品目',
        acceptable.filter(item => initial.has(item.id)),
      ),
      ...toSections('rest', '残りの品目', acceptable.filter(item => !initial.has(item.id))),
    ];
  }, [items, initialItemIds, detected]);

  //一覧から消えた品目は数に入れない
  const selectedCount = useMemo(
    () =>
      items === null
        ? 0
        : items.filter(item => selectedIds.has(item.id) && isAcceptable(item)).length,
    [items, selectedIds],
  );


  const initialItemMissing =
    items !== null &&
    !submitting &&
    initialItemIds.some(id => !items.some(item => item.id === id && isAcceptable(item)));

  function handlePressItem(item: ItemWithId) {
    if (submitting) {
      return;
    }
    navigation.navigate('RequestDetail', { itemId: item.id, selected: selectedIds.has(item.id) });
  }

  //受け付けた品目をまとめて確定する
  async function handleSubmit() {
    if (submitting || items === null) {
      return;
    }

    //一覧から消えた品目を対象から外す
    const targets = items.filter(item => selectedIds.has(item.id) && isAcceptable(item));
    if (targets.length === 0) {
      setError('品目をタップして受け付けてください。');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await approveRequest(familyId, targets.map(item => item.id));
    } catch (submitError) {
      //既に成功した品目は担当中のまま残す
      setError(failedItemMessage(submitError, 'approveRequest', targets));
      setSubmitting(false);
      return;
    }

    navigation.popTo('ItemList');
  }

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

  return (
    <View style={styles.container}>
      {initialItemMissing && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>
            受け付けられない品目があります。他の人が担当を始めたか、完了した可能性があります。
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
        keyExtractor={item => item.id}
        style={styles.listContainer}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>受け付けられる品目はありません</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            {section.first && (
              <View style={[styles.groupHeader, section.group === 'rest' && styles.groupHeaderRest]}>
                <Text style={styles.groupTitle}>{section.groupTitle}</Text>
                <Text style={styles.groupCount}>{section.groupCount}件</Text>
              </View>
            )}
            <Text style={styles.categoryTitle}>{section.title}</Text>
          </View>
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
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>{item.itemName}</Text>
                {item.isImportant && (
                  <View style={styles.importantBadge}>
                    <Text style={styles.importantBadgeText}>重要</Text>
                  </View>
                )}
                {selected && <Text style={styles.selectedTag}>受付予定</Text>}
              </View>
              <Text style={styles.meta}>{itemStateLabel(item)}</Text>
              {item.note !== '' && <Text style={styles.note}>{item.note}</Text>}
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
            title={`確定する（${selectedCount}件）`}
            primary
            disabled={selectedCount === 0}
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
    gap: 8,
    marginBottom: -4,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupHeaderRest: {
    marginTop: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#dde3ea',
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  groupCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#06c',
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
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
  selectedTag: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#06c',
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
