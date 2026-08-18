import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { setStringAsync } from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { signOut } from '../services/auth';
import { observeFamilyDoc } from '../services/family';
import type { FamilyDoc } from '../types/firestore';


type Props = {
  familyId: string;
};

export default function HomePage({ familyId }: Props) {

  //ItemList画面に遷移するためのナビオブジェクトを取得
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const [family, setFamily] = useState<FamilyDoc | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setFamily(null);
    const unsubscribe = observeFamilyDoc(familyId, setFamily);
    return unsubscribe;
  }, [familyId]);

  const inviteCode: string | undefined = family?.inviteCode;

  //招待コードをクリップボードにコピーする
  async function handleCopy() {
    if (inviteCode === undefined) {
      return;
    }

    setError(null);
    try {
      //コピーできた時だけ表示を切り替える
      const succeeded = await setStringAsync(inviteCode);
      setCopied(succeeded);
    } catch (copyError) {
      setCopied(false);
      setError(errorMessage(copyError));
    }
  }

  //ログアウトする
  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setError(null);
    setSigningOut(true);
    try {

      //observeAuthState で変化を検知する
      await signOut();
    } catch (authError) {
      setError(errorMessage(authError));
      setSigningOut(false);
    }
  }

  if (family === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.familyName}>{family.familyName}</Text>

      <Text style={styles.label}>招待コード</Text>

      {inviteCode === undefined ? (
        <Text style={styles.error}>
          この家族グループには招待コードが登録されていません。
        </Text>
      ) : (
        <>
          <Text style={styles.inviteCode}>{inviteCode}</Text>
          <Text style={styles.note}>
            家族を招待するときは、このコードを伝えてください。
          </Text>

          <Button title="招待コードをコピーする" onPress={handleCopy} />
          {copied && <Text style={styles.copied}>コピーしました。</Text>}
        </>
      )}

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <Button
        title="不足品の一覧"
        onPress={() => navigation.navigate('ItemList')}
        disabled={signingOut}
      />

      {signingOut ? (
        <ActivityIndicator />
      ) : (
        <Button title="ログアウト" onPress={handleSignOut} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  familyName: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  label: {
    textAlign: 'center',
    color: '#666',
  },
  inviteCode: {
    fontSize: 32,
    letterSpacing: 4,
    textAlign: 'center',
  },
  note: {
    textAlign: 'center',
    color: '#666',
  },
  copied: {
    textAlign: 'center',
    color: '#080',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});