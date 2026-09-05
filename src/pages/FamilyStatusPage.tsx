import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, FlatList, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import { formatDateTime, transportModeLabel } from '../lib/format';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { observeFamilyDoc } from '../services/family';
import { isBusy, observeMembers, resolveTransportMode } from '../services/member';
import type { MemberWithId } from '../services/member';
import type { FamilyDoc } from '../types/firestore';

//家族全員の移動手段と拘束状況を確認する画面
type Props = {
  familyId: string;
  uid: string;
};

//拘束の内容と終了時刻を表示する
function busyLabel(member: MemberWithId): string {
  if (!isBusy(member) || member.busyUntilTime === null) {
    return '拘束なし';
  }
  return `${member.busyLabel ?? '内容なし'}・${formatDateTime(member.busyUntilTime)} まで`;
}

export default function FamilyStatusPage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [family, setFamily] = useState<FamilyDoc | null>(null);
  const [members, setMembers] = useState<MemberWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  //家族グループの情報を監視する
  useEffect(() => {
    setFamily(null);

    const unsubscribe = observeFamilyDoc(familyId, setFamily, observeError => {
      setError(errorMessage(observeError));
    });

    return unsubscribe;
  }, [familyId]);

  //メンバーの情報を監視する
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

  if (members === null) {
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

      <View style={styles.homeLocation}>
        <Text style={styles.homeLocationLabel}>
          家の位置：
          {family === null ? '確認中' : family.homeLocation === null ? '未設定' : '設定済み'}
        </Text>
        <Button
          title="家の位置を設定する"
          onPress={() => navigation.navigate('HomeLocation')}
        />
      </View>

      <FlatList
        data={members}
        keyExtractor={member => member.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>メンバーがいません。</Text>
        }
        renderItem={({ item: member }) => {
          const self = member.id === uid;

          return (
            <View style={[styles.member, self && styles.memberSelf]}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName}>
                  {member.displayName}
                  {self && '（自分）'}
                </Text>
                <Text style={styles.level}>Lv.{member.level}</Text>
              </View>
              <Text style={styles.meta}>
                移動手段：{transportModeLabel(resolveTransportMode(member))}
              </Text>
              <Text style={isBusy(member) ? styles.busy : styles.meta}>
                {busyLabel(member)}
              </Text>
            </View>
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
  homeLocation: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    gap: 8,
  },
  homeLocationLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  member: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
    gap: 4,
  },
  memberSelf: {
    borderColor: '#06c',
    backgroundColor: '#eef4fc',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  displayName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  level: {
    fontWeight: 'bold',
    color: '#06c',
  },
  meta: {
    color: '#666',
  },
  busy: {
    color: '#c60',
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