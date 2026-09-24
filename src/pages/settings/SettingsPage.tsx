import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { hasActivityPermission } from '../../../modules/backgroundLocation';
import type { MainStackParamList } from '../../navigation/RootNavigator';
import { startBackgroundLocation } from '../../services/device/backgroundLocation';
import { ensureGeofenceMonitor } from '../../services/geofenceMonitor';

//遷移先画面一覧
type SettingsScreen = 'MyStatus' | 'FamilyStatus' | 'Camera';

type MenuButtonProps = {
  title: string;
  description: string;
  onPress: () => void;
};

//遷移先を示す
function MenuButton({ title, description, onPress }: MenuButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}
    >
      <View style={styles.menuText}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuDescription}>{description}</Text>
      </View>
      <Text style={styles.menuChevron}>›</Text>
    </Pressable>
  );
}

export default function SettingsPage() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [permissionText, setPermissionText] = useState('確認中');

  //権限の状態を表示する
  const refreshPermissions = useCallback(async () => {
    const background = await Location.getBackgroundPermissionsAsync();
    const location = background.granted ? '位置: 常に許可' : '位置: 未許可';
    const activity = hasActivityPermission() ? '身体活動: 許可' : '身体活動: 未許可';
    setPermissionText(`${location} / ${activity}`);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshPermissions();
    }, [refreshPermissions]),
  );

  async function handlePermissions() {
    try {
      await startBackgroundLocation();
      await ensureGeofenceMonitor();
    } catch (error) {
      console.warn('[SettingsPage] 権限の要求に失敗', error);
    }
    await refreshPermissions();
    const background = await Location.getBackgroundPermissionsAsync();
    if (!background.granted || !hasActivityPermission()) {
      await Linking.openSettings();
    }
  }

  function handleNavigate(screen: SettingsScreen) {
    if (screen === 'Camera') {
      navigation.navigate('Camera', { mode: 'baseline' });
      return;
    }
    navigation.navigate(screen);
  }

  return (
    <View style={styles.container}>
      <MenuButton
        title="位置情報の権限"
        description={permissionText}
        onPress={() => void handlePermissions()}
      />

      <MenuButton
        title="自分のステータス"
        description="移動手段や予定を設定する"
        onPress={() => handleNavigate('MyStatus')}
      />

      <MenuButton
        title="家族のステータス"
        description="家族の状況と招待コード"
        onPress={() => handleNavigate('FamilyStatus')}
      />

      <MenuButton
        title="基準を登録する"
        description="撮影して基準を登録する"
        onPress={() => handleNavigate('Camera')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    gap: 16,
    backgroundColor: '#F7F9FC',
  },
  menuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dde3ea',
  },
  menuButtonPressed: {
    opacity: 0.7,
  },
  menuText: {
    flex: 1,
    gap: 2,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  menuDescription: {
    fontSize: 18,
    color: '#666',
  },
  menuChevron: {
    fontSize: 24,
    color: '#999',
    marginLeft: 12,
  },
});