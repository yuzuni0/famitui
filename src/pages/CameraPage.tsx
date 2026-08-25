import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchCameraAsync, useCameraPermissions } from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Button, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '../lib/errors';
import type { MainStackParamList } from '../navigation/RootNavigator';
import { uploadPhoto } from '../services/photo';
import type { CameraMode } from '../types/firestore';
//撮影を行う画面

type Props = {
  familyId: string;
  uid: string;
  mode: CameraMode;
};

//現在の状態を表す
const MODE_LABELS: Record<CameraMode, string> = {
  baseline: '基準を登録する',
  detect: '不足品を検出する',
};

//撮影した画像を圧縮する
const PHOTO_QUALITY = 0.5;

export default function CameraPage({ familyId, mode }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  //カメラ権限の取得
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  //撮影とアップロード
  async function handleCapture() {
    //撮影中は連打を防ぐ
    if (submitting) {
      return;
    }

    setError(null);

    //許可されていない場合はその場で求める
    let granted = permission?.granted ?? false;
    if (!granted) {
      const next = await requestPermission();
      granted = next.granted;
    }

    //拒否された後は端末の設定から変更する必要がある
    if (!granted) {
      Alert.alert(
        'カメラを使用できません',
        '端末の設定から、カメラの使用を許可してください。',
      );
      return;
    }

    setSubmitting(true);
    try {
      //端末のカメラ画面を開く
      const result = await launchCameraAsync({
        mediaTypes: 'images',
        quality: PHOTO_QUALITY,
      });

      //撮影せずに閉じた場合は何もしない
      if (result.canceled) {
        setSubmitting(false);
        return;
      }

      const storagePath = await uploadPhoto(familyId, result.assets[0].uri);

      //戻る操作で撮影の画面に戻らないようにする
      navigation.replace('DetectionResult', { storagePath, mode });
    } catch (captureError) {
      //失敗時は撮影の画面に留まる
      setError(errorMessage(captureError));
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.mode}>{MODE_LABELS[mode]}</Text>

      <Text style={styles.description}>
        冷蔵庫や棚が写るように撮影してください。
      </Text>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      {/* アップロードに時間がかかる */}
      {submitting ? (
        <View style={styles.uploading}>
          <ActivityIndicator size="large" />
          <Text style={styles.note}>アップロードしています…</Text>
        </View>
      ) : (
        <Button title="撮影する" onPress={handleCapture} />
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
  mode: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
  uploading: {
    alignItems: 'center',
    gap: 12,
  },
  note: {
    textAlign: 'center',
    color: '#666',
  },
  error: {
    textAlign: 'center',
    color: '#c00',
  },
});
