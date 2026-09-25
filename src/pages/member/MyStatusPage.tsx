import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import WheelPicker from '@quidone/react-native-wheel-picker';
import { signOut } from '../../services/device/auth';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, transportModeLabel } from '../../lib/format';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { handleStoreEntered } from '../../services/geofenceMonitor';
import { progressToNextLevel, todayJst } from '../../lib/level';
import { busyUntilTimeFromNow, isBusy, isTransportModeManual, observeMember, updateDisplayName, updateMemberStatus } from '../../services/firestore/member';
import type { MemberWithId } from '../../services/firestore/member';
import { observeStores } from '../../services/firestore/store';
import type { StoreWithId } from '../../services/firestore/store';
import { updateFcmToken } from '../../services/firestore/member';
import { DISPLAY_NAME_MAX_LENGTH } from '../../services/firestore/user';
import { TRANSPORT_MODES } from '../../types/firestore';
import type { TransportMode } from '../../types/firestore';

//自分の移動手段と予定を設定する画面
type Props = {
  familyId: string;
  uid: string;
};

const BUSY_LABEL_MAX_LENGTH = 20;

//移動手段の選択肢
const TRANSPORT_CHOICES = [
  ...TRANSPORT_MODES.filter(entry => entry.id !== 'none'),
  { id: 'none', label: '自動判定' },
] as const;

//ホイールの選択肢
const HOUR_ITEMS = Array.from({ length: 24 }, (_, value) => ({ value, label: String(value) }));
const MINUTE_ITEMS = Array.from({ length: 60 }, (_, value) => ({ value, label: String(value) }));

//時間の表示
function formatRemaining(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

type ActionButtonProps = {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  compact?: boolean;
  disabled: boolean;
  onPress: () => void;
};

//操作ボタン
function ActionButton({ title, variant = 'secondary', compact = false, disabled, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.actionButtonCompact,
        variant === 'primary' && styles.actionButtonPrimary,
        variant === 'danger' && styles.actionButtonDanger,
        pressed && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      <Text
        style={[
          styles.actionTitle,
          variant === 'primary' && styles.actionTitlePrimary,
          variant === 'danger' && styles.actionTitleDanger,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export default function MyStatusPage({ familyId, uid }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [member, setMember] = useState<MemberWithId | null>(null);
  const [stores, setStores] = useState<StoreWithId[] | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  //表示名の入力
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  //予定の入力
  const [busyLabelInput, setBusyLabelInput] = useState('');
  const [busyHours, setBusyHours] = useState(1);
  const [busyMinutes, setBusyMinutes] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [now, setNow] = useState(Date.now());
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

  //ログアウトする
  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setError(null);
    setSigningOut(true);

    //FCMトークンを削除する
    try {
      await updateFcmToken(familyId, uid, null);
    } catch (tokenError) {
      console.warn('[HomePage] updateFcmToken 失敗', tokenError);
    }

    try {
      //observeAuthState で変化を検知する
      await signOut();
    } catch (authError) {
      setError(errorMessage(authError));
      setSigningOut(false);
    }
  }

  //店舗の情報を監視する
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

  //表示名の編集を始める
  function handleStartEditName() {
    if (submitting || member === null) {
      return;
    }
    setNameInput(member.displayName);
    setEditingName(true);
  }

  //表示名を保存する
  async function handleSaveName() {
    if (submitting) {
      return;
    }

    const name = nameInput.trim();
    if (name === '') {
      setError('表示名を入力してください。');
      return;
    }
    if ([...name].length > DISPLAY_NAME_MAX_LENGTH) {
      setError(`表示名は${DISPLAY_NAME_MAX_LENGTH}文字以下で入力してください。`);
      return;
    }

    if (name === member?.displayName) {
      setEditingName(false);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await updateDisplayName(familyId, uid, name);
    } catch (submitError) {
      setError(errorMessage(submitError));
      setSubmitting(false);
      return;
    }

    setEditingName(false);
    setSubmitting(false);
  }

  //移動手段の設定
  async function handleSelectTransportMode(mode: TransportMode) {
    if (submitting || mode === member?.transportMode) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      //未設定時は自動設定にする
      await updateMemberStatus(familyId, uid, {
        transportMode: mode,
        transportModeManualDate: mode === 'none' ? null : todayJst(),
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
    }

    setSubmitting(false);
  }

  //残り時間の更新処理
  const busyUntilMs = member?.busyUntilTime?.toMillis() ?? null;
  useEffect(() => {
    if (busyUntilMs === null || busyUntilMs <= Date.now()) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      //停止
      if (current >= busyUntilMs) {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [busyUntilMs]);

  const remainingMinutes =
    busyUntilMs !== null && busyUntilMs > now ? Math.ceil((busyUntilMs - now) / 60000) : null;

  //ホイール表示の切り替え
  function handleTogglePicker() {
    if (submitting) {
      return;
    }
    if (!pickerVisible && remainingMinutes !== null) {
      setBusyHours(Math.min(23, Math.floor(remainingMinutes / 60)));
      setBusyMinutes(remainingMinutes % 60);
    }
    setPickerVisible(!pickerVisible);
  }

  //予定を設定する
  async function handleSetBusy() {
    if (submitting) {
      return;
    }

    const label = busyLabelInput.trim();
    if (label === '') {
      setError('予定の内容を入力してください。');
      return;
    }

    const durationMs = (busyHours * 60 + busyMinutes) * 60 * 1000;
    if (durationMs === 0) {
      setError('終了までの時間を選択してください。');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await updateMemberStatus(familyId, uid, {
        busyLabel: label,
        busyUntilTime: busyUntilTimeFromNow(durationMs),
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
      setSubmitting(false);
      return;
    }

    setBusyLabelInput(label);
    setPickerVisible(false);
    setSubmitting(false);
  }

  //予定を解除する
  async function handleClearBusy() {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      //内容と終了時刻の両方をnullにする
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
        <ActivityIndicator size="large" color="#06c" />
        <Text style={styles.loadingText}>自分のステータスを読み込んでいます…</Text>
        {error !== null && (
          <View style={[styles.errorBanner, styles.loadingBanner]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  //家族から外れた場合の表示
  if (member === null) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <View style={styles.emptyIconCircle}>
            <Text style={styles.emptyIcon}>❓</Text>
          </View>
          <Text style={styles.emptyTitle}>メンバー情報が見つかりません</Text>
          <Text style={styles.emptyDescription}>家族グループから外れた可能性があります。</Text>
        </View>
      </View>
    );
  }

  const progress = progressToNextLevel(member.score);
  const busy = remainingMinutes !== null;

  return (
    <View style={styles.container}>
      {error !== null && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          {editingName ? (
            <View style={styles.nameRow}>
              <TextInput
                style={[styles.input, styles.nameInput]}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="表示名"
                placeholderTextColor="#9ca3af"
                editable={!submitting}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
              />
              <Pressable
                style={({ pressed }) => [styles.nameAction, pressed && styles.pressed]}
                onPress={() => setEditingName(false)}
                disabled={submitting}
              >
                <Text style={styles.nameActionText}>取消</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.nameAction, pressed && styles.pressed]}
                onPress={handleSaveName}
                disabled={submitting || nameInput.trim() === ''}
              >
                <Text style={[styles.nameActionText, styles.nameActionPrimary]}>保存</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.nameRow}>
              <Pressable
                style={({ pressed }) => [styles.nameButton, pressed && styles.pressed]}
                onPress={handleStartEditName}
                disabled={submitting}
              >
                <Text style={styles.displayName}>{member.displayName}</Text>
                <Text style={styles.editIcon}>✎</Text>
              </Pressable>
              <View style={styles.levelChip}>
                <Text style={styles.levelChipText}>Lv.{member.level}</Text>
              </View>
            </View>
          )}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress.ratio * 100}%` }]} />
          </View>
          {progress.next === null && <Text style={styles.meta}>最高レベルです</Text>}
          <Pressable
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            onPress={() => navigation.navigate('RequestableItems')}
            disabled={submitting}
          >
            <Text style={styles.linkText}>依頼できるカテゴリを見る</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionHeader}>移動手段</Text>
        <View style={styles.choices}>
          {TRANSPORT_CHOICES.map(entry => {
            const selected = member.transportMode === entry.id;
            return (
              <Pressable
                key={entry.id}
                style={({ pressed }) => [
                  styles.choice,
                  selected && styles.choiceSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => handleSelectTransportMode(entry.id)}
                disabled={submitting}
              >
                <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionHeader}>予定</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>予定の内容</Text>
          <TextInput
            style={styles.input}
            value={busyLabelInput}
            onChangeText={setBusyLabelInput}
            placeholder="仕事、学校など"
            placeholderTextColor="#9ca3af"
            editable={!submitting}
            maxLength={BUSY_LABEL_MAX_LENGTH}
          />

          <Text style={styles.fieldLabel}>終了までの時間</Text>
          <View style={styles.durationArea}>
            <Pressable onPress={handleTogglePicker} disabled={submitting}>
              <Text style={[styles.duration, pickerVisible && styles.durationActive]}>
                {busy
                  ? formatRemaining(remainingMinutes)
                  : formatRemaining(busyHours * 60 + busyMinutes)}
              </Text>
            </Pressable>
            {pickerVisible && (
              <View style={styles.pickerRow}>
                <WheelPicker
                  data={HOUR_ITEMS}
                  value={busyHours}
                  onValueChanged={({ item }) => setBusyHours(item.value)}
                  width={72}
                  itemHeight={36}
                  visibleItemCount={3}
                  readOnly={submitting}
                />
                <Text style={styles.value}>時間</Text>
                <WheelPicker
                  data={MINUTE_ITEMS}
                  value={busyMinutes}
                  onValueChanged={({ item }) => setBusyMinutes(item.value)}
                  width={72}
                  itemHeight={36}
                  visibleItemCount={3}
                  readOnly={submitting}
                />
                <Text style={styles.value}>分</Text>
              </View>
            )}
          </View>

          <ActionButton
            title="予定を設定する"
            variant="primary"
            compact
            onPress={handleSetBusy}
            disabled={submitting || busyLabelInput.trim() === ''}
          />
          {busy && (
            <ActionButton title="予定を解除する" variant="danger" compact onPress={handleClearBusy} disabled={submitting} />
          )}
        </View>

        {signingOut ? (
          <ActivityIndicator color="#06c" style={styles.logout} />
        ) : (
          <Pressable
            style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
            onPress={handleSignOut}
            disabled={submitting}
          >
            <Text style={styles.logoutText}>ログアウトする</Text>
          </Pressable>
        )}
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
    marginTop: 16,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 11,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: -4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameButton: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  editIcon: {
    fontSize: 16,
    color: '#9ca3af',
  },
  nameInput: {
    flex: 1,
    paddingVertical: 6,
  },
  nameAction: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  nameActionText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  nameActionPrimary: {
    color: '#4682b4',
  },
  levelChip: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: '#eef4fc',
  },
  levelChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#06c',
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e8eef5',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: '#06c',
  },
  meta: {
    color: '#6b7280',
    lineHeight: 20,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  linkText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#06c',
  },
  chevron: {
    fontSize: 20,
    lineHeight: 24,
    color: '#999',
  },
  pressed: {
    opacity: 0.7,
  },
  choices: {
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: -6,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 7,
    backgroundColor: '#fff',
  },
  choiceSelected: {
    borderColor: '#4682b4',
    backgroundColor: '#4682b4',
  },
  choiceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  choiceLabelSelected: {
    color: '#fff',
  },
  fieldLabel: {
    color: '#6b7280',
    marginBottom: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  value: {
    fontSize: 16,
    color: '#111827',
  },
  duration: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#111827',
  },
  durationActive: {
    color: '#06c',
  },
  durationArea: {
    marginVertical: -8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logout: {
    alignSelf: 'center',
    marginTop: -4,
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#c00',
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
  actionButtonCompact: {
    paddingVertical: 9,
  },
  actionButtonPrimary: {
    borderWidth: 0,
    backgroundColor: '#4682b4',
  },
  actionButtonDanger: {
    borderWidth: 0,
    backgroundColor: '#fff5f5',
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
  actionTitleDanger: {
    color: '#c00',
  },
});
