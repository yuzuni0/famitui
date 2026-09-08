import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import { CATEGORY_LABELS, CATEGORY_UNLOCK_LEVEL, MAX_LEVEL, canRequestCategory, importantRequestLimit } from '../lib/level';
import type { ItemCategory } from '../lib/level';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { observeMember } from '../services/member';
import type { MemberWithId } from '../services/member';

//レベルごとに依頼できるカテゴリを確認する画面
type Props = {
  familyId: string;
  uid: string;
};

const CATEGORY_ROWS = (Object.keys(CATEGORY_UNLOCK_LEVEL) as ItemCategory[]).sort(
  (a, b) => CATEGORY_UNLOCK_LEVEL[a] - CATEGORY_UNLOCK_LEVEL[b],
);

function nextUnlockNote(level: number): string {
  if (level >= MAX_LEVEL) {
    return '最高レベルです';
  }
  const nextLevel = level + 1;
  const unlocked = CATEGORY_ROWS.filter(category => CATEGORY_UNLOCK_LEVEL[category] === nextLevel);
  if (unlocked.length === 0) {
    return `レベル${nextLevel}で開放されるカテゴリはありません`;
  }
  const labels = unlocked.map(category => CATEGORY_LABELS[category]).join('、');
  return `レベル${nextLevel}で${labels}が開放されます`;
}

export default function RequestableItemsPage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

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
        <Button title="閉じる" onPress={() => navigation.goBack()} />
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
        <Text style={styles.note}>{nextUnlockNote(level)}</Text>

        <Text style={styles.label}>依頼できるカテゴリ</Text>
        {CATEGORY_ROWS.map(category => {
          const requestable = canRequestCategory(level, category);
          return (
            <View key={category} style={[styles.row, !requestable && styles.rowLocked]}>
              <Text style={styles.rowName}>{CATEGORY_LABELS[category]}</Text>
              <Text style={styles.rowLevel}>レベル{CATEGORY_UNLOCK_LEVEL[category]}で開放</Text>
            </View>
          );
        })}

        <Text style={styles.label}>重要な依頼</Text>
        <Text style={styles.value}>
          {importantLimit < 1 ? 'レベル3から使えます' : `1日${importantLimit}回まで`}
        </Text>
      </ScrollView>

      <Button title="閉じる" onPress={() => navigation.goBack()} />
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
  content: {
    gap: 8,
    paddingBottom: 12,
  },
  levelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  label: {
    marginTop: 8,
    color: '#666',
  },
  value: {
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
  },
  rowLocked: {
    opacity: 0.4,
  },
  rowName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  rowLevel: {
    color: '#666',
  },
  note: {
    color: '#666',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});