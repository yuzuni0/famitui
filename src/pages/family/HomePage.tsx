import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../../lib/errors';
import { progressToNextLevel } from '../../lib/level';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { isExpired, observeMyAssignments, remainingLabel, sortByExpireTime } from '../../services/firestore/assignment';
import type { AssignmentWithId } from '../../services/firestore/assignment';
import { observeFamilyDoc } from '../../services/firestore/family';
import { observeItems } from '../../services/firestore/item';
import type { ItemWithId } from '../../services/firestore/item';
import { observeMember } from '../../services/firestore/member';
import type { MemberWithId } from '../../services/firestore/member';
import type { FamilyDoc } from '../../types/firestore';

type Props = {
  familyId: string;
  uid: string;
};

export default function HomePage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [family, setFamily] = useState<FamilyDoc | null>(null);
  const [member, setMember] = useState<MemberWithId | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentWithId[] | null>(null);
  const [items, setItems] = useState<ItemWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  //家族名を監視する
  useEffect(() => {
    setFamily(null);
    const unsubscribe = observeFamilyDoc(familyId, setFamily);
    return unsubscribe;
  }, [familyId]);

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

  //自分のたんとう品目を監視する
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

    //期限の近い順に担当品目を並べる
  const rows = useMemo(() => {
    if (assignments === null || items === null) {
      return [];
    }
    const itemsById = new Map(items.map(item => [item.id, item]));
    return sortByExpireTime(assignments.filter(assignment => !isExpired(assignment))).map(
      assignment => ({
        assignment,
        item: itemsById.get(assignment.itemId) ?? null,
      }),
    );
  }, [assignments, items]);

  if (family === null || !memberLoaded || assignments === null || items === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#06c" />
        {error !== null && (
          <View style={[styles.errorBanner, styles.loadingBanner]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  const progress = member === null ? null : progressToNextLevel(member.score);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error !== null && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={() => navigation.navigate('MyStatus')}
      >
        <Text style={styles.familyName}>{family.familyName}</Text>

        <View style={styles.profileRow}>
          <Text style={styles.displayName}>{member?.displayName ?? '名前なし'}</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Lv.{member?.level ?? 1}</Text>
          </View>
        </View>

        {progress !== null && (
          <View style={styles.progress}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress.ratio * 100)}%` }]} />
            </View>
          </View>
        )}
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>担当している品目</Text>
        <Pressable onPress={() => navigation.navigate('AssignedList')} hitSlop={8}>
          <Text style={styles.sectionLink}>すべて見る ›</Text>
        </Pressable>
      </View>

      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>担当している品目はありません</Text>
          <Text style={styles.emptyDescription}>
            依頼を受け付けると担当品目が表示されます
          </Text>
        </View>
      ) : (
        rows.map(({ assignment, item }) => (
          <Pressable
            key={assignment.id}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate('AssignmentDetail', { itemId: assignment.itemId })}
          >
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item?.itemName ?? '削除された品目'}</Text>
              {item?.isImportant === true && (
                <View style={styles.importantBadge}>
                  <Text style={styles.importantBadgeText}>重要</Text>
                </View>
              )}
            </View>
            <Text style={styles.meta}>{remainingLabel(assignment)}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
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
  loadingBanner: {
    alignSelf: 'stretch',
  },
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    padding: 16,
    paddingTop: 9,
    gap: 12,
  },
  errorBanner: {
    backgroundColor: '#fdecec',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.7,
  },
  familyLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  familyName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  levelBadge: {
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 10,
    backgroundColor: '#eef4fc',
  },
  levelBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#06c',
  },
  progress: {
    gap: 4,
    marginTop: 4,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#06c',
  },
  progressText: {
    fontSize: 12,
    color: '#6b7280',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#06c',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  emptyDescription: {
    color: '#6b7280',
    lineHeight: 20,
    textAlign: 'center',
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
});
