import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../../lib/errors';
import { signOut } from '../../services/device/auth';
import { DISPLAY_NAME_MAX_LENGTH, createUserDoc } from '../../services/firestore/user';

//ログイン済みだが users/{uid} が無い場合に、表示名を聞いて作り直す

type Props = {
  uid: string;
};

export default function ProfileSetupPage({ uid }: Props) {

  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  //users/{uid} を作り直す
  async function handleSubmit() {
    if (submitting) {
      return;
    }

    const trimmedDisplayName = displayName.trim();
    setDisplayName(trimmedDisplayName);

    if (trimmedDisplayName === '') {
      setError('表示名を入力してください。');
      return;
    }

    if ([...trimmedDisplayName].length > DISPLAY_NAME_MAX_LENGTH) {
      setError(`表示名は${DISPLAY_NAME_MAX_LENGTH}文字以下で入力してください。`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      //observeUserDoc が変化を検知して次の画面に進む
      await createUserDoc(uid, trimmedDisplayName);
    } catch (createError) {
      setError(errorMessage(createError));
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await signOut();
    } catch (signOutError) {
      setError(errorMessage(signOutError));
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>プロフィール登録</Text>
      <Text style={styles.message}>
        ユーザー情報が登録されていません。表示名を入力してください。
      </Text>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>表示名</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="表示名"
            placeholderTextColor="#9ca3af"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            editable={!submitting}
          />
        </View>
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
          onPress={handleSubmit}
          style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && styles.buttonPressed]}
        >
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>登録する</Text>
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
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 14,
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