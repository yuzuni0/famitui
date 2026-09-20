import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../../lib/errors';
import { signOut } from '../../services/device/auth';
import { createFamily, joinFamily } from '../../services/functions/familyActions';

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
      <Text style={styles.title}>家族グループ</Text>

      <View style={styles.modes}>
        {(['create', 'join'] as Mode[]).map(candidate => (
          <Pressable
            key={candidate}
            onPress={() => changeMode(candidate)}
            disabled={submitting}
            style={({ pressed }) => [
              styles.mode,
              mode === candidate && styles.modeSelected,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={[styles.modeLabel, mode === candidate && styles.modeLabelSelected]}>
              {candidate === 'create' ? '作成する' : '参加する'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        {mode === 'create' ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>家族名</Text>
            <TextInput
              style={styles.input}
              value={familyName}
              onChangeText={setFamilyName}
              placeholder="例: 山田家"
              placeholderTextColor="#9ca3af"
              editable={!submitting}
            />
          </View>
        ) : (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>招待コード</Text>
            <TextInput
              style={[styles.input, styles.inputCode]}
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="招待コード"
              placeholderTextColor="#9ca3af"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              editable={!submitting}
            />
            <Text style={styles.hint}>家族から共有されたコードを入力してください</Text>
          </View>
        )}
      </View>

      {error !== null && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {submitting ? (
        <View style={[styles.button, styles.buttonPrimary]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <Pressable
          onPress={mode === 'create' ? handleCreate : handleJoin}
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && styles.buttonPressed]}
        >
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
            {mode === 'create' ? '家族グループを作成する' : '家族グループに参加する'}
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={handleSignOut}
        disabled={submitting}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          submitting && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.buttonText}>ログアウト</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#F7F9FC',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  modes: {
    flexDirection: 'row',
    gap: 8,
  },
  mode: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 999,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  modeSelected: {
    borderColor: '#4682b4',
    backgroundColor: '#4682b4',
  },
  modeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  modeLabelSelected: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dde3ea',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#f4f6f8',
  },
  inputCode: {
    fontSize: 20,
    letterSpacing: 4,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#6b7280',
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
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dde3ea',
    backgroundColor: '#fff',
  },
  buttonPrimary: {
    borderColor: '#4682b4',
    backgroundColor: '#4682b4',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4682b4',
  },
  buttonTextPrimary: {
    color: '#fff',
  },
});
