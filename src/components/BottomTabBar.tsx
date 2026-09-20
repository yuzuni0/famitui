import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MainStackParamList } from '../navigation/RootNavigator';

//全画面の下部に出すタブ

type TabKey = 'ItemList' | 'Camera' | 'Settings' | 'Home';

type Tab = {
  key: TabKey;
  label: string;
  icon: string;
};

type Props = {
  navigationRef: NavigationContainerRefWithCurrent<MainStackParamList>;
};

const TABS: Tab[] = [
  { key: 'Home', label: 'ホーム', icon: '🏠' },
  { key: 'ItemList', label: '不足品の一覧', icon: '📋' },
  { key: 'Camera', label: '不足品の検出', icon: '📷' },
  { key: 'Settings', label: '設定', icon: '⚙️' },
];

//タブを出さない画面
const HIDDEN_ROUTES = new Set<string>(['LevelUp', 'Route', 'StoreSearch', 'HomeLocation']);

function isActive(tab: Tab, route: { name: string; params?: object } | undefined): boolean {
  if (route === undefined || route.name !== tab.key) {
    return false;
  }
  if (tab.key === 'Camera') {
    return (route.params as { mode?: string } | undefined)?.mode === 'detect';
  }
  return true;
}

export default function BottomTabBar({ navigationRef }: Props) {

  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState(() =>
    navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined,
  );

  useEffect(() => {
    const update = () => setRoute(navigationRef.getCurrentRoute());
    update();
    return navigationRef.addListener('state', update);
  }, [navigationRef]);

  function handlePress(tab: Tab) {
    if (!navigationRef.isReady() || isActive(tab, route)) {
      return;
    }
    if (tab.key === 'Home') {
      navigationRef.reset({ index: 0, routes: [{ name: 'Home' }] });
      return;
    }
    const target =
      tab.key === 'Camera' ? { name: 'Camera' as const, params: { mode: 'detect' as const } } : { name: tab.key };
    navigationRef.reset({ index: 1, routes: [{ name: 'Home' }, target] });
  }

  if (route !== undefined && HIDDEN_ROUTES.has(route.name)) {
    return null;
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map(tab => {
        const active = isActive(tab, route);
        return (
          <Pressable
            key={tab.key}
            onPress={() => handlePress(tab)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            <Text style={[styles.icon, active && styles.iconActive]}>{tab.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  tabPressed: {
    opacity: 0.6,
  },
  icon: {
    fontSize: 20,
    opacity: 0.5,
  },
  iconActive: {
    opacity: 1,
  },
  label: {
    fontSize: 11,
    color: '#6b7280',
  },
  labelActive: {
    color: '#06c',
    fontWeight: 'bold',
  },
});
