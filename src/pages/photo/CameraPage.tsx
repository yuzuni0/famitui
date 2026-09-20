import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { launchCameraAsync, useCameraPermissions } from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../lib/errors';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { CAMERA_MODE_LABELS } from '../../types/firestore';
import type { CameraMode } from '../../types/firestore';
//撮影を行う画面

type Props = {
  familyId: string;
  uid: string;
  mode: CameraMode;
};

//撮影した画像を圧縮する
const PHOTO_QUALITY = 0.5;

type ActionButtonProps = {
  title: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
};

function ActionButton({ title, primary = false, disabled, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        primary && styles.actionButtonPrimary,
        pressed && styles.actionButtonPressed,
        disabled && styles.actionButtonDisabled,
      ]}
    >
      <Text style={[styles.actionTitle, primary && styles.actionTitlePrimary]}>{title}</Text>
    </Pressable>
  );
}

export default function CameraPage({ mode }: Props) {

  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const insets = useSafeAreaInsets();

  //カメラ権限の取得
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  //撮影と判定
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

      //戻る操作で撮影の画面に戻らないようにする
      navigation.replace('DetectionResult', { localUri: result.assets[0].uri, mode });
    } catch (captureError) {
      //失敗時は撮影の画面に留まる
      setError(errorMessage(captureError));
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      {error !== null && (
        <View style={[styles.errorBanner, styles.topBanner]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={styles.icon}>📷</Text>
          </View>
          <Text style={styles.title}>{CAMERA_MODE_LABELS[mode]}</Text>
          <Text style={styles.description}>冷蔵庫や棚が写るように撮影してください。</Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {submitting ? (
          <View style={[styles.actionButton, styles.actionButtonPrimary]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : (
          <ActionButton title="撮影する" primary disabled={false} onPress={handleCapture} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8eef5',
  },
  icon: {
    marginTop: -7,
    fontSize: 32,
    lineHeight: 36,
    textAlign: 'center',
    includeFontPadding: false,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  description: {
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: '#fdecec',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  topBanner: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  errorText: {
    color: '#b42318',
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  actionButtonPrimary: {
    borderWidth: 0,
    backgroundColor: '#4682b4',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#4682b4',
  },
  actionTitlePrimary: {
    color: '#fff',
  },
});
