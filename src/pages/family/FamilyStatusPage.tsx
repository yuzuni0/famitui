import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { setStringAsync } from 'expo-clipboard';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, transportModeLabel } from '../../lib/format';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { observeFamilyDoc } from '../../services/firestore/family';
import { isBusy, observeMembers } from '../../services/firestore/member';
import type { MemberWithId } from '../../services/firestore/member';
import type { FamilyDoc } from '../../types/firestore';

//家族全員の移動手段と予定を確認する画面
type Props = {
  familyId: string;
  uid: string;
};

//予定の内容と終了時刻を表示する
function busyLabel(member: MemberWithId): string {
  if (!isBusy(member) || member.busyUntilTime === null) {
    return '予定なし';
  }
  return `${member.busyLabel ?? '内容なし'}・${formatDateTime(member.busyUntilTime)} まで`;
}

export default function FamilyStatusPage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [family, setFamily] = useState<FamilyDoc | null>(null);
  const [members, setMembers] = useState<MemberWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  //招待コードをクリップボードにコピーする
  async function handleCopy() {
    if (inviteCode === undefined) {
      return;
    }

    setError(null);
    try {
      //コピーできた時だけ表示を切り替える
      const succeeded = await setStringAsync(inviteCode);
      setCopied(succeeded);
    } catch (copyError) {
      setCopied(false);
      setError(errorMessage(copyError));
    }
  }

  const inviteCode: string | undefined = family?.inviteCode;

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

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>家族のステータス</Text>
        {members.length === 0 && <Text style={styles.empty}>メンバーがいません。</Text>}
        {members.map(member => {
          const self = member.id === uid;

          return (
            <View key={member.id} style={[styles.card, self && styles.memberSelf]}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName}>
                  {member.displayName}
                  {self && '（自分）'}
                </Text>
                <View style={styles.levelChip}>
                  <Text style={styles.levelChipText}>Lv.{member.level}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  移動手段：{transportModeLabel(member.transportMode)}
                </Text>
                {!isBusy(member) && <Text style={styles.meta}>{busyLabel(member)}</Text>}
              </View>
              {isBusy(member) && <Text style={styles.busy}>{busyLabel(member)}</Text>}
            </View>
          );
        })}

        <Text style={styles.label}>家の位置</Text>
        <View style={styles.card}>
          <Text style={styles.value}>
            {family === null ? '確認中' : family.homeLocation === null ? '未設定' : '設定済み'}
          </Text>
          <Pressable
            onPress={() => navigation.navigate('HomeLocation')}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>家の位置を設定する</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>招待コード</Text>
        <View style={styles.card}>
          {inviteCode === undefined ? (
            <Text style={styles.error}>
              この家族グループには招待コードが登録されていません。
            </Text>
          ) : (
            <>
              <Text style={styles.inviteCode}>{inviteCode}</Text>
              <Text style={styles.note}>
                家族をグループに招待する際に使用します
              </Text>
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              >
                <Text style={styles.buttonText}>招待コードをコピーする</Text>
              </Pressable>
              {copied && <Text style={styles.copied}>コピーしました。</Text>}
            </>
          )}
        </View>
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
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  card: {
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    backgroundColor: '#fff',
  },
  memberSelf: {
    borderColor: '#06c',
    backgroundColor: '#eef4fc',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  levelChip: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    backgroundColor: '#eef4fc',
  },
  levelChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#06c',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  meta: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  busy: {
    fontSize: 14,
    lineHeight: 20,
    color: '#c60',
  },
  value: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111827',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde3ea',
    backgroundColor: '#fff',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4682b4',
  },
  empty: {
    textAlign: 'center',
    color: '#6b7280',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
  inviteCode: {
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 4,
    textAlign: 'center',
    color: '#111827',
  },
  note: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
  },
  copied: {
    textAlign: 'center',
    color: '#080',
  },
});
