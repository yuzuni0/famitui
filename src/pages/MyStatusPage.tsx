import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View, } from 'react-native';

import { errorMessage } from '../lib/errors';
import { formatDateTime, transportModeLabel } from '../lib/format';
import { progressToNextLevel } from '../lib/level';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { handleStoreEntered } from '../services/geofenceMonitor';
import { busyUntilTimeFromNow, isBusy, observeMember, resolveTransportMode, transportModeExpireTime, updateMemberStatus, } from '../services/member';
import type { MemberWithId } from '../services/member';
import { observeStores } from '../services/store';
import type { StoreWithId } from '../services/store';
import { TRANSPORT_MODES } from '../types/firestore';
import type { TransportMode } from '../types/firestore';

//自分の移動手段と拘束状況を設定する画面
type Props = {
  familyId: string;
  uid: string;
};

const BUSY_LABEL_MAX_LENGTH = 20;

//拘束の長さの選択肢
const BUSY_DURATIONS = [
  { label: '30分', durationMs: 30 * 60 * 1000 },
  { label: '1時間', durationMs: 60 * 60 * 1000 },
  { label: '2時間', durationMs: 2 * 60 * 60 * 1000 },
  { label: '3時間', durationMs: 3 * 60 * 60 * 1000 },
];

export default function MyStatusPage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [member, setMember] = useState<MemberWithId | null>(null);
  const [stores, setStores] = useState<StoreWithId[] | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  //拘束状況の入力
  const [busyLabelInput, setBusyLabelInput] = useState('');
  const [busyDurationMs, setBusyDurationMs] = useState(BUSY_DURATIONS[1].durationMs);
  const busyLabelInitialized = useRef(false);

  //自分のメンバー情報を監視する
  useEffect(() => {
    setMember(null);
    setMemberLoaded(false);
    setError(null);
    busyLabelInitialized.current = false;

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

  // テストにで使う監視
  useEffect(() => {
    setStores(null);

    const unsubscribe = observeStores(
      familyId,
      setStores,
      observeError => {
        setError(errorMessage(observeError));
      },
    );

    return unsubscribe;
  }, [familyId]);

  //読み込めた時点の状況を反映する
  useEffect(() => {
    if (member === null || busyLabelInitialized.current) {
      return;
    }
    busyLabelInitialized.current = true;
    setBusyLabelInput(member.busyLabel ?? '');
  }, [member]);

  //移動手段を切り替える
  async function handleSelectTransportMode(mode: TransportMode) {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      //期限は移動手段に合わせて更新する
      await updateMemberStatus(familyId, uid, {
        transportMode: mode,
        transportModeExpireTime: transportModeExpireTime(mode),
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
    }

    setSubmitting(false);
  }

  //拘束状況を設定する
  async function handleSetBusy() {
    if (submitting) {
      return;
    }

    const label = busyLabelInput.trim();
    if (label === '') {
      setError('拘束の内容を入力してください。');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await updateMemberStatus(familyId, uid, {
        busyLabel: label,
        busyUntilTime: busyUntilTimeFromNow(busyDurationMs),
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
      setSubmitting(false);
      return;
    }

    setBusyLabelInput(label);
    setSubmitting(false);
  }

  //拘束状態を解除する
  async function handleClearBusy() {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      //内容と終了時刻の両方をnullる
      await updateMemberStatus(familyId, uid, {
        busyLabel: null,
        busyUntilTime: null,
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
      setSubmitting(false);
      return;
    }

    setBusyLabelInput('');
    setSubmitting(false);
  }

  //foodを扱う店舗への進入を模擬する
  async function handleSimulateEnter() {
    const store = stores?.find(entry => entry.categories.includes('food'));
    if (store === undefined) {
      setError('food を扱う店舗が stores にありません');
      return;
    }

    setError(null);
    try {
      await handleStoreEntered(familyId, uid, {
        storeId: store.id,
        storeName: store.storeName,
        location: store.location,
        categories: store.categories,
      });
    } catch (simulateError) {
      setError(errorMessage(simulateError));
    }
  }

  //読み込み中の表示
  if (!memberLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        {error !== null && <Text style={styles.error}>{error}</Text>}
      </View>
    );
  }

  //家族から外れた場合の表示
  if (member === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>メンバー情報が見つかりませんでした。</Text>
        <Button title="閉じる" onPress={() => navigation.goBack()} />
      </View>
    );
  }

  //期限切れの場合はなしにする
  const displayedMode = resolveTransportMode(member);

  const progress = progressToNextLevel(member.score);

  return (
    <View style={styles.container}>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.displayName}>{member.displayName}</Text>

        <Text style={styles.levelTitle}>レベル {member.level}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress.ratio * 100}%` }]} />
        </View>
        {progress.next === null && <Text style={styles.note}>最高レベルです</Text>}
        <Button
          title="依頼できるカテゴリを見る"
          onPress={() => navigation.navigate('RequestableItems')}
          disabled={submitting}
        />

        <Text style={styles.label}>移動手段</Text>
        <Text style={styles.value}>{transportModeLabel(displayedMode)}</Text>

        <Text style={styles.label}>移動手段の有効期限</Text>
        <Text style={styles.value}>
          {member.transportModeExpireTime === null
            ? '期限なし'
            : `${formatDateTime(member.transportModeExpireTime)} まで`}
        </Text>

        {displayedMode !== member.transportMode && (
          <Text style={styles.note}>
            期限切れ
          </Text>
        )}

        <View style={styles.choices}>
          {TRANSPORT_MODES.map(entry => (
            <Pressable
              key={entry.id}
              style={[styles.choice, displayedMode === entry.id && styles.choiceSelected]}
              onPress={() => handleSelectTransportMode(entry.id)}
              disabled={submitting}
            >
              <Text style={displayedMode === entry.id ? styles.choiceLabelSelected : undefined}>
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>拘束状況</Text>
        {member.busyUntilTime === null ? (
          <Text style={styles.value}>なし</Text>
        ) : (
          <>
            <Text style={styles.value}>{member.busyLabel ?? '内容なし'}</Text>
            <Text style={isBusy(member) ? styles.value : styles.expired}>
              {formatDateTime(member.busyUntilTime)} まで
              {isBusy(member) ? '' : '（終了済み）'}
            </Text>
          </>
        )}

        <Text style={styles.label}>拘束の内容</Text>
        <TextInput
          style={styles.input}
          value={busyLabelInput}
          onChangeText={setBusyLabelInput}
          placeholder="仕事、学校など"
          editable={!submitting}
          maxLength={BUSY_LABEL_MAX_LENGTH}
        />

        <Text style={styles.label}>終了までの時間</Text>
        <View style={styles.choices}>
          {BUSY_DURATIONS.map(entry => (
            <Pressable
              key={entry.label}
              style={[
                styles.choice,
                busyDurationMs === entry.durationMs && styles.choiceSelected,
              ]}
              onPress={() => setBusyDurationMs(entry.durationMs)}
              disabled={submitting}
            >
              <Text
                style={
                  busyDurationMs === entry.durationMs ? styles.choiceLabelSelected : undefined
                }
              >
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Button title="拘束を設定する" onPress={handleSetBusy} disabled={submitting} />
        <Button
          title="拘束を解除する"
          color="#c00"
          onPress={handleClearBusy}
          disabled={submitting || member.busyUntilTime === null}
        />
        <Button title="店舗進入を模擬する（テスト）" onPress={handleSimulateEnter} />
      </ScrollView>

      <Button title="閉じる" onPress={() => navigation.goBack()} disabled={submitting} />
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
  displayName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  levelTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressTrack: {
    height: 12,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#06c',
  },
  label: {
    marginTop: 8,
    color: '#666',
  },
  value: {
    fontSize: 16,
  },
  expired: {
    fontSize: 16,
    color: '#c00',
  },
  note: {
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 12,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  choice: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  choiceSelected: {
    borderColor: '#06c',
    backgroundColor: '#06c',
  },
  choiceLabelSelected: {
    color: '#fff',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});
