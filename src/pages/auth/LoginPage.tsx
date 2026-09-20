import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../../lib/errors';
import type { AuthStackParamList } from '../../navigation/RootNavigator';
import { signIn } from '../../services/device/auth';

export default function LoginPage() {

  //SignUp画面に遷移するためのナビオブジェクトを取得
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (submitting) {
      return;
    }

    const trimmedEmail = email.trim();
    setEmail(trimmedEmail);

    if (trimmedEmail === '' || password === '') {
      setError('すべての項目を入力してください。');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      //成功しても遷移はしない
      //observeAuthState で変化を検知する
      await signIn(trimmedEmail, password);
    } catch (authError) {
      setError(errorMessage(authError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ログイン</Text>

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
          <Text style={[styles.buttonText, styles.buttonTextPrimary]}>ログイン</Text>
        </Pressable>
      )}

      <Pressable
        onPress={() => navigation.navigate('SignUp')}
        disabled={submitting}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          submitting && styles.buttonDisabled,
        ]}
      >
        <Text style={styles.buttonText}>アカウントを作成する</Text>
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
