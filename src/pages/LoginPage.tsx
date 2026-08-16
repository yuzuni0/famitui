import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { AuthStackParamList } from '../navigation/RootNavigator';
import { signIn } from '../services/auth';

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

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {submitting ? (
        <ActivityIndicator />
      ) : (
        <Button title="ログイン" onPress={handleSubmit} />
      )}

      <Button
        title="アカウントを作成する"
        onPress={() => navigation.navigate('SignUp')}
        disabled={submitting}
      />
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