import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (

    <SafeAreaProvider>
      <NavigationContainer>
        {/* 認証状態と家族グループの所属状態はRootNavigatorで監視する */}
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}