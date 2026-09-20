import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { errorMessage } from '../../lib/errors';
import { signUp } from '../../services/device/auth';
import { DISPLAY_NAME_MAX_LENGTH, createUserDoc } from '../../services/firestore/user';

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
      <Text style={styles.title}>アカウントを作成</Text>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>メールアドレス</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="example@mail.com"
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>パスワード</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="パスワード"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            autoCapitalize="none"
            editable={!submitting}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>表示名</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="家族に表示される名前"
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
    backgroundColor: '#fff',
  },
  buttonPrimary: {
    backgroundColor: '#4682b4',
  },
  buttonPressed: {
    opacity: 0.7,
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
