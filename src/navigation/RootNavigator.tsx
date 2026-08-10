import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import FamilySetupPage from '../pages/FamilySetupPage';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import SignUpPage from '../pages/SignUpPage';
import { observeAuthState } from '../services/auth';
import { observeUserDoc } from '../services/user';
import type { UserDoc } from '../types/firestore';


//未ログインのスタック
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

//家族に未所属のスタック
export type FamilySetupStackParamList = {
  FamilySetup: undefined;
};

//家族に所属済みのスタック
export type MainStackParamList = {
  Home: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const FamilySetupStack = createNativeStackNavigator<FamilySetupStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

//判定が終わるまでの間に出す表示
function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export default function RootNavigator() {

  const [uid, setUid] = useState<string | null>(null);//uid
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);//uidの中身
  const [initializing, setInitializing] = useState(true);//判定中かどうか

  //ログイン状態を監視する
  useEffect(() => {
    const unsubscribe = observeAuthState(nextUid => {//一度だけ呼ばれる
      setUid(nextUid);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  //users/{uid} を監視する
  useEffect(() => {
    //未ログインの間は監視を開始しない
    if (uid === null) {
      setUserDoc(null);
      return;
    }

    setUserDoc(null);//監視前の状態をnull
    const unsubscribe = observeUserDoc(uid, setUserDoc);
    return unsubscribe;
  }, [uid]);


  if (initializing) {
    return <LoadingScreen />;
  }

  //未ログイン
  if (uid === null) {
    return (
      <AuthStack.Navigator>
        <AuthStack.Screen name="Login" component={LoginPage} />
        <AuthStack.Screen name="SignUp" component={SignUpPage} />
      </AuthStack.Navigator>
    );
  }

  if (userDoc === null) {
    return <LoadingScreen />;
  }

  if (userDoc.familyId === null) {
    return (
      <FamilySetupStack.Navigator>
        <FamilySetupStack.Screen name="FamilySetup" component={FamilySetupPage} />
      </FamilySetupStack.Navigator>
    );
  }

  return (
    <MainStack.Navigator>
      <MainStack.Screen name="Home" component={HomePage} />
    </MainStack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});