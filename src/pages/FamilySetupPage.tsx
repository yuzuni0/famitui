import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import { signOut } from '../services/auth';
import { createFamily, joinFamily } from '../services/family';

//家族グループの作成と参加状態
type Mode = 'create' | 'join';

const FAMILY_NAME_TOO_LONG_LENGTH = 20;

export default function FamilySetupPage() {

  const [mode, setMode] = useState<Mode>('create');
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  //表示する入力欄の切り替え。
  function changeMode(nextMode: Mode) {
    if (submitting || mode === nextMode) {
      return;
    }

    setMode(nextMode);
    setError(null);
  }

  //家族グループを新規作成する
  async function handleCreate() {
    if (submitting) {
      return;
    }

    const trimmedFamilyName = familyName.trim();
    setFamilyName(trimmedFamilyName);

    if (trimmedFamilyName === '') {
      setError('家族名を入力してください。');
      return;
    }

    if (trimmedFamilyName.length >= FAMILY_NAME_TOO_LONG_LENGTH) {
      setError(`家族名が長すぎます。${FAMILY_NAME_TOO_LONG_LENGTH}文字未満で入力してください。`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await createFamily(trimmedFamilyName);
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSubmitting(false);
    }
  }

  //招待コードで既存の家族グループに参加する
  async function handleJoin() {
    if (submitting) {
      return;
    }

    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    setInviteCode(normalizedInviteCode);

    if (normalizedInviteCode === '') {
      setError('招待コードを入力してください。');
      return;
    }

    if (normalizedInviteCode.length !== 6) {
      setError('招待コードは6文字で入力してください。');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await joinFamily(normalizedInviteCode);
    } catch (joinError) {
      setError(errorMessage(joinError));
    } finally {
      setSubmitting(false);
    }
  }

  //ログアウトする
  async function handleSignOut() {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      //observeAuthState が変化を検知する
      await signOut();
    } catch (signOutError) {
      setError(errorMessage(signOutError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.modes}>
        <View style={styles.mode}>
          <Button
            title="作成する"
            onPress={() => changeMode('create')}
            color={mode === 'create' ? undefined : '#999'}
            disabled={submitting}
          />
        </View>
        <View style={styles.mode}>
          <Button
            title="参加する"
            onPress={() => changeMode('join')}
            color={mode === 'join' ? undefined : '#999'}
            disabled={submitting}
          />
        </View>
      </View>

      {mode === 'create' ? (
        <TextInput
          style={styles.input}
          value={familyName}
          onChangeText={setFamilyName}
          placeholder="家族名"
          editable={!submitting}
        />
      ) : (
        <TextInput
          style={styles.input}
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="招待コード"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!submitting}
        />
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {submitting ? (
        <ActivityIndicator />
      ) : mode === 'create' ? (
        <Button title="家族グループを作成する" onPress={handleCreate} />
      ) : (
        <Button title="家族グループに参加する" onPress={handleJoin} />
      )}

      <Button title="ログアウト" onPress={handleSignOut} disabled={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  modes: {
    flexDirection: 'row',
    gap: 12,
  },
  mode: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  error: {
    color: '#c00',
  },
});