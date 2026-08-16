import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '../lib/errors';
import { signUp } from '../services/auth';
import { createUserDoc } from '../services/user';

const DISPLAY_NAME_MAX_LENGTH = 20;

export default function SignUpPage() {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) {
      return;
    }
    if (email === '' || password === '' || displayName === '') {
      setError('すべての項目を入力してください。');
      return;
    }

    if ([...displayName].length > DISPLAY_NAME_MAX_LENGTH) {
      setError(`表示名は${DISPLAY_NAME_MAX_LENGTH}文字以下で入力してください。`);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const uid = await signUp(email, password);

      await createUserDoc(uid, displayName);
    } catch (authError) {
      setError(errorMessage(authError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="メールアドレス"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!submitting}
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="パスワード"
        secureTextEntry
        autoCapitalize="none"
        editable={!submitting}
      />
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