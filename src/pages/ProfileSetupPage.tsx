import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import { signOut } from '../services/auth';
import { createUserDoc } from '../services/user';

//ログイン済みだが users/{uid} が無い場合に、表示名を聞いて作り直す

const DISPLAY_NAME_MAX_LENGTH = 20;

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
      <Text style={styles.message}>
        ユーザー情報が登録されていません。表示名を入力してください。
      </Text>

      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="表示名"
        editable={!submitting}
      />

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {submitting ? (
        <ActivityIndicator />
      ) : (
        <Button title="登録する" onPress={handleSubmit} />
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
  message: {
    textAlign: 'center',
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