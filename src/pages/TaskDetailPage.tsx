import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { isExpired, observeAssignment, remainingMillis } from '../services/assignment';
import type { AssignmentWithId } from '../services/assignment';
import { observeItems } from '../services/item';
import type { ItemWithId } from '../services/item';
import { observeMembers } from '../services/member';
import type { MemberWithId } from '../services/member';
import { CATEGORIES } from '../types/firestore';
import type { CategoryId } from '../types/firestore';

//担当している不足品の詳細を表示し、ナビとかに遷移するための画面
type Props = {
  familyId: string;
  uid: string;
  itemId: string;
};

function categoryLabel(category: CategoryId): string {
  return CATEGORIES.find(entry => entry.id === category)?.label ?? category;
}

//担当の期限を表示する
function remainingLabel(assignment: AssignmentWithId): string {
  if (isExpired(assignment)) {
    return '期限切れ';
  }

  const minutes = Math.floor(remainingMillis(assignment) / 60000);
  return minutes < 1 ? 'まもなく期限' : `残り${minutes}分`;
}

export default function TaskDetailPage({ familyId, uid, itemId }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [members, setMembers] = useState<MemberWithId[] | null>(null);
  const [assignment, setAssignment] = useState<AssignmentWithId | null>(null);
  const [assignmentLoaded, setAssignmentLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignmentId = `${itemId}_${uid}`;

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

  //依頼者の表示名を取得するために監視する
  useEffect(() => {
    setMembers(null);
    setError(null);

    const unsubscribe = observeMembers(
      familyId,
      nextMembers => {
        setMembers(nextMembers);
        setError(null);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId]);

  //自分の担当品を監視する
  useEffect(() => {
    setAssignment(null);
    setAssignmentLoaded(false);
    setError(null);

    const unsubscribe = observeAssignment(
      familyId,
      assignmentId,
      nextAssignment => {
        setAssignment(nextAssignment);
        setAssignmentLoaded(true);
        setError(null);
      },
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId, assignmentId]);

  //一覧から対象の品目を絞り込む
  const item = useMemo(
    () => (items === null ? null : items.find(entry => entry.id === itemId) ?? null),
    [items, itemId],
  );

  //uid から表示名を取得する
  const requesterName = useMemo(() => {
    if (item === null) {
      return '依頼なし';
    }
    if (item.requesterUserId === null) {
      return '依頼なし';
    }
    return (
      members?.find(member => member.id === item.requesterUserId)?.displayName ??
      item.requesterUserId
    );
  }, [item, members]);

  //読み込み中はローディング表示をする
  if (items === null || members === null || !assignmentLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  //担当から外れた時にエラー
  if (item === null || assignment === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>
          {item === null
            ? 'この品目は見つかりませんでした。削除された可能性があります。'
            : 'この品目の担当は見つかりませんでした。'}
        </Text>
        <Button title="閉じる" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  //担当として有効化を確認する
  const active = assignment.status === 'active';

  return (
    <View style={styles.container}>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      {!active && (
        <Text style={styles.error}>この品目の担当ではなくなりました。</Text>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>商品名</Text>
        <Text style={styles.itemName}>{item.itemName}</Text>

        <Text style={styles.label}>カテゴリ</Text>
        <Text style={styles.value}>{categoryLabel(item.category)}</Text>

        <Text style={styles.label}>代替品</Text>
        {item.alternativeItemNames.length === 0 ? (
          <Text style={styles.value}>なし</Text>
        ) : (
          item.alternativeItemNames.map((name, index) => (
            <Text key={`${index}-${name}`} style={styles.value}>
              ・{name}
            </Text>
          ))
        )}

        <Text style={styles.label}>距離の上限（メートル）</Text>
        <Text style={styles.value}>
          {item.maxDistanceMeters != null ? String(item.maxDistanceMeters) : '指定なし'}
        </Text>

        {item.note !== '' && (
          <>
            <Text style={styles.label}>備考</Text>
            <Text style={styles.value}>{item.note}</Text>
          </>
        )}

        <Text style={styles.label}>依頼者</Text>
        <Text style={styles.value}>{requesterName}</Text>

        <Text style={styles.label}>期限</Text>
        <Text style={isExpired(assignment) ? styles.expired : styles.value}>
          {remainingLabel(assignment)}
        </Text>
      </ScrollView>

      {active && (
        <Button
          title="購入した報告"
          onPress={() => navigation.navigate('PurchaseReport', { initialItemId: itemId })}
        />
      )}
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
    gap: 4,
    paddingBottom: 12,
  },
  label: {
    marginTop: 8,
    color: '#666',
  },
  itemName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  value: {
    fontSize: 16,
  },
  expired: {
    fontSize: 16,
    color: '#c00',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});