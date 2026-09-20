import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../lib/errors';
import { categoryLabel } from '../../lib/format';
import { CATEGORY_UNLOCK_LEVEL, canRequestCategory, importantRequestLimit } from '../../lib/level';
import { observeMember } from '../../services/firestore/member';
import type { MemberWithId } from '../../services/firestore/member';
import type { CategoryId } from '../../types/firestore';

//レベルごとに依頼できるカテゴリを確認する画面
type Props = {
  familyId: string;
  uid: string;
};

const CATEGORY_ROWS = (Object.keys(CATEGORY_UNLOCK_LEVEL) as CategoryId[]).sort(
  (a, b) => CATEGORY_UNLOCK_LEVEL[a] - CATEGORY_UNLOCK_LEVEL[b],
);

export default function RequestableItemsPage({ familyId, uid }: Props) {


  const [member, setMember] = useState<MemberWithId | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  //メンバー情報を監視する
  useEffect(() => {
    setMember(null);
    setMemberLoaded(false);
    setError(null);

    const unsubscribe = observeMember(
      familyId,
      uid,
      nextMember => {
        setMember(nextMember);
        setMemberLoaded(true);
        setError(null);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId, uid]);

  if (!memberLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  if (member === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>メンバー情報が見つかりませんでした。</Text>
      </View>
    );
  }

  const level = member.level;
  const importantLimit = importantRequestLimit(level);

  return (
    <View style={styles.container}>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.levelTitle}>レベル {level}</Text>

        <Text style={styles.label}>依頼できるカテゴリ</Text>
        {CATEGORY_ROWS.map(category => {
          const requestable = canRequestCategory(level, category);
          return (
            <View key={category} style={[styles.row, !requestable && styles.rowLocked]}>
              <Text style={[styles.rowName, !requestable && styles.rowTextLocked]}>{categoryLabel(category)}</Text>
              <Text style={[styles.rowLevel, !requestable && styles.rowTextLocked]}>
                レベル{CATEGORY_UNLOCK_LEVEL[category]}で開放
              </Text>
            </View>
          );
        })}

        <Text style={styles.label}>重要な依頼</Text>
        <Text style={styles.value}>
          {importantLimit < 1 ? 'レベル3から使えます' : `1日${importantLimit}回まで`}
        </Text>
      </ScrollView>
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
    backgroundColor: '#F7F9FC',
  },
  content: {
    gap: 10,
    paddingBottom: 12,
  },
  levelTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  value: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111827',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  rowLocked: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  rowName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  rowLevel: {
    fontSize: 13,
    color: '#6b7280',
  },
  rowTextLocked: {
    color: '#9ca3af',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});
