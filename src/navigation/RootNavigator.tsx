import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import AcceptRequestPage from '../pages/AcceptRequestPage';
import AssignedListPage from '../pages/AssignedListPage';
import FamilySetupPage from '../pages/FamilySetupPage';
import HomePage from '../pages/HomePage';
import ItemListPage from '../pages/ItemListPage';
import LoginPage from '../pages/LoginPage';
import ProfileSetupPage from '../pages/ProfileSetupPage';
import PurchaseReportPage from '../pages/PurchaseReportPage';
import SignUpPage from '../pages/SignUpPage';
import TaskDetailPage from '../pages/TaskDetailPage';
import { observeAuthState } from '../services/auth';
import { observeUserDoc } from '../services/user';
import type { UserDocSnapshot } from '../services/user';


//未ログインのスタック
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

//ユーザー情報が未登録のスタック
export type ProfileSetupStackParamList = {
  ProfileSetup: undefined;
};

//家族に未所属のスタック
export type FamilySetupStackParamList = {
  FamilySetup: undefined;
};

//家族に所属済みのスタック
export type MainStackParamList = {
  Home: undefined;
  ItemList: undefined;
  AcceptRequest: { initialItemId: string };
  AssignedList: undefined;
  AssignmentDetail: { itemId: string };
  PurchaseReport: { initialItemId: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const ProfileSetupStack = createNativeStackNavigator<ProfileSetupStackParamList>();
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
  const [userDoc, setUserDoc] = useState<UserDocSnapshot | null>(null);
  const [initializing, setInitializing] = useState(true);//判定中かどうか

  //ログイン状態を監視する
  useEffect(() => {
    const unsubscribe = observeAuthState(nextUid => {//ログイン状態が変わった時に呼ぶ
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

  if (userDoc === null || userDoc.status === 'unknown') {
    return <LoadingScreen />;
  }

  if (userDoc.status === 'missing') {
    return (
      <ProfileSetupStack.Navigator>
        <ProfileSetupStack.Screen name="ProfileSetup">
          {() => <ProfileSetupPage uid={uid} />}
        </ProfileSetupStack.Screen>
      </ProfileSetupStack.Navigator>
    );
  }

  if (userDoc.user.familyId === null) {
    return (
      <FamilySetupStack.Navigator>
        <FamilySetupStack.Screen name="FamilySetup" component={FamilySetupPage} />
      </FamilySetupStack.Navigator>
    );
  }

  const familyId = userDoc.user.familyId;
  return (
    <MainStack.Navigator>
      <MainStack.Screen name="Home">
        {() => <HomePage familyId={familyId} />}
      </MainStack.Screen>
      <MainStack.Screen name="ItemList">
        {() => <ItemListPage familyId={familyId} uid={uid} />}
      </MainStack.Screen>
      <MainStack.Screen name="AssignedList" options={{ title: '担当している品目' }}>
        {() => <AssignedListPage familyId={familyId} uid={uid} />}
      </MainStack.Screen>
      <MainStack.Screen name="AssignmentDetail" options={{ title: '担当の詳細' }}>
        {({ route }) => (
          <TaskDetailPage familyId={familyId} uid={uid} itemId={route.params.itemId} />
        )}
      </MainStack.Screen>
      <MainStack.Screen name="AcceptRequest" options={{ title: '依頼を受け付ける' }}>
        {({ route }) => (
          <AcceptRequestPage
            familyId={familyId}
            uid={uid}
            initialItemId={route.params.initialItemId}
          />
        )}
      </MainStack.Screen>
      <MainStack.Screen name="PurchaseReport" options={{ title: '購入を報告する' }}>
        {({ route }) => (
          <PurchaseReportPage
            familyId={familyId}
            uid={uid}
            initialItemId={route.params.initialItemId}
          />
        )}
      </MainStack.Screen>
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