import { createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';

import AcceptRequestPage from '../pages/AcceptRequestPage';
import AssignedListPage from '../pages/AssignedListPage';
import CameraPage from '../pages/CameraPage';
import ChatPage from '../pages/ChatPage';
import DetectionResultPage from '../pages/DetectionResultPage';
import FamilySetupPage from '../pages/FamilySetupPage';
import FamilyStatusPage from '../pages/FamilyStatusPage';
import HomeLocationPage from '../pages/HomeLocationPage';
import HomePage from '../pages/HomePage';
import ItemListPage from '../pages/ItemListPage';
import LevelUpPage from '../pages/LevelUpPage';
import LoginPage from '../pages/LoginPage';
import MyStatusPage from '../pages/MyStatusPage';
import ProfileSetupPage from '../pages/ProfileSetupPage';
import PurchaseConfirmPage from '../pages/PurchaseConfirmPage';
import PurchaseReportPage from '../pages/PurchaseReportPage';
import RequestableItemsPage from '../pages/RequestableItemsPage';
import RoutePage from '../pages/RoutePage';
import SignUpPage from '../pages/SignUpPage';
import StoreSearchPage from '../pages/StoreSearchPage';
import TaskDetailPage from '../pages/TaskDetailPage';
import { observeAuthState } from '../services/auth';
import { initBackgroundLocation, startBackgroundLocation, stopBackgroundLocation } from '../services/backgroundLocation';
import { startGeofenceMonitor } from '../services/geofenceMonitor';
import { initNotifications, parseNotificationData } from '../services/notification';
import type { NotificationData } from '../services/notification';
import { shouldOpenPurchaseConfirm } from '../services/paymentConfirm';
import { registerFcmToken } from '../services/pushToken';
import { observeUserDoc } from '../services/user';
import type { UserDocSnapshot } from '../services/user';
import type { CameraMode } from '../types/firestore';


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
  Route: { storeId: string };
  PurchaseReport: { initialItemId: string };
  PurchaseConfirm: undefined;
  LevelUp: { previousLevel: number; newLevel: number; addedScore: number };
  MyStatus: undefined;
  RequestableItems: undefined;
  FamilyStatus: undefined;
  HomeLocation: undefined;
  StoreSearch: undefined;
  Camera: { mode: CameraMode };
  DetectionResult: { storagePath: string; mode: CameraMode };
  Chat: { familyId: string; assignmentId: string; itemName: string; partnerUserId: string };
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const ProfileSetupStack = createNativeStackNavigator<ProfileSetupStackParamList>();
const FamilySetupStack = createNativeStackNavigator<FamilySetupStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

//ナビゲーターの外から遷移する
export const navigationRef = createNavigationContainerRef<MainStackParamList>();

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
  const [pendingNotification, setPendingNotification] = useState<NotificationData | null>(null);
  const handledNotificationId = useRef<string | null>(null);//同じ通知を二重に処理しない

  //通知を受け取った時の処理
  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (response === null) {
        return;
      }
      const request = response.notification.request;
      if (handledNotificationId.current === request.identifier) {
        return;
      }
      handledNotificationId.current = request.identifier;
      setPendingNotification(parseNotificationData(request.content.data));
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    //終了状態から通知で起動された場合
    Notifications.getLastNotificationResponseAsync().then(handleResponse).catch(error => {
      console.warn('[RootNavigator] getLastNotificationResponseAsync 失敗', error);
    });
    return () => subscription.remove();
  }, []);

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

  //通知用トークンの保存と位置監視
  const familyId = userDoc?.status === 'found' ? userDoc.user.familyId : null;
  useEffect(() => {
    console.log('[RootNavigator] token effect', { uid, familyId });
    if (uid === null || familyId === null) {
      return;
    }
    registerFcmToken(familyId, uid).catch(error => {
      console.warn('[RootNavigator] registerFcmToken 失敗', error);
    });

    let cancelled = false;
    let stopMonitor: (() => void) | null = null;
    (async () => {
      try {
        await initNotifications();
        await initBackgroundLocation();
        await startBackgroundLocation();
        if (cancelled) {
          return;
        }
        stopMonitor = startGeofenceMonitor(familyId, uid);
      } catch (error) {
        console.warn('[RootNavigator] 位置監視の開始に失敗', error);
      }
    })();

    //位置情報の取得をログアウトまで続ける
    return () => {
      cancelled = true;
      stopMonitor?.();
    };
  }, [uid, familyId]);

  //ログアウト時に位置情報の取得を止める
  const prevUid = useRef<string | null>(null);
  useEffect(() => {
    if (prevUid.current !== null && uid === null) {
      stopBackgroundLocation().catch(error => {
        console.warn('[RootNavigator] stopBackgroundLocation 失敗', error);
      });
    }
    prevUid.current = uid;
  }, [uid]);

  //通知先へ遷移する
  useEffect(() => {
    if (familyId === null || pendingNotification === null || !navigationRef.isReady()) {
      return;
    }
    setPendingNotification(null);
    if (pendingNotification.kind === 'nearbyStore') {
      navigationRef.navigate('AcceptRequest', { initialItemId: pendingNotification.itemIds[0] });
    } else if (pendingNotification.kind === 'chat') {
      const { assignmentId, itemName, partnerUserId } = pendingNotification;
      navigationRef.navigate('Chat', {
        familyId,
        assignmentId,
        itemName,
        partnerUserId,
      });
    } else {
      navigationRef.navigate('ItemList');
    }
  }, [familyId, pendingNotification]);

  //決済通知を元に遷移する
  useEffect(() => {
    if (uid === null || familyId === null) {
      return;
    }

    let cancelled = false;
    const check = async () => {
      if (!navigationRef.isReady() || navigationRef.getCurrentRoute()?.name === 'PurchaseConfirm') {
        return;
      }
      try {
        const shouldOpen = await shouldOpenPurchaseConfirm(familyId, uid);
        if (!cancelled && shouldOpen) {
          navigationRef.navigate('PurchaseConfirm');
        }
      } catch (error) {
        console.warn('[RootNavigator] shouldOpenPurchaseConfirm 失敗', error);
      }
    };

    //起動時と通知タップの起動時
    check();

    
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        check();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [uid, familyId]);

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

  if (familyId === null) {
    return (
      <FamilySetupStack.Navigator>
        <FamilySetupStack.Screen name="FamilySetup" component={FamilySetupPage} />
      </FamilySetupStack.Navigator>
    );
  }

  return (
    <MainStack.Navigator>
      <MainStack.Screen name="Home">
        {() => <HomePage familyId={familyId} uid={uid} />}
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
      <MainStack.Screen name="Route" options={{ title: 'ナビゲーション' }}>
        {({ route }) => (
          <RoutePage familyId={familyId} uid={uid} storeId={route.params.storeId} />
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
      <MainStack.Screen name="PurchaseConfirm" options={{ title: '購入の確認' }}>
        {() => <PurchaseConfirmPage familyId={familyId} uid={uid} />}
      </MainStack.Screen>
      <MainStack.Screen
        name="LevelUp"
        options={{ title: 'レベルアップ', headerBackVisible: false, gestureEnabled: false }}
      >
        {({ route }) => (
          <LevelUpPage
            previousLevel={route.params.previousLevel}
            newLevel={route.params.newLevel}
            addedScore={route.params.addedScore}
          />
        )}
      </MainStack.Screen>
      <MainStack.Screen name="MyStatus" options={{ title: '自分の状態' }}>
        {() => <MyStatusPage familyId={familyId} uid={uid} />}
      </MainStack.Screen>
      <MainStack.Screen name="RequestableItems" options={{ title: '依頼できるカテゴリ' }}>
        {() => <RequestableItemsPage familyId={familyId} uid={uid} />}
      </MainStack.Screen>
      <MainStack.Screen name="FamilyStatus" options={{ title: '家族の状態' }}>
        {() => <FamilyStatusPage familyId={familyId} uid={uid} />}
      </MainStack.Screen>
      <MainStack.Screen name="HomeLocation" options={{ title: '家の位置' }}>
        {() => <HomeLocationPage familyId={familyId} />}
      </MainStack.Screen>
      <MainStack.Screen name="StoreSearch" options={{ title: '店舗を選ぶ' }}>
        {() => <StoreSearchPage familyId={familyId} />}
      </MainStack.Screen>
      <MainStack.Screen name="Camera" options={{ title: '撮影する' }}>
        {({ route }) => (
          <CameraPage familyId={familyId} uid={uid} mode={route.params.mode} />
        )}
      </MainStack.Screen>
      <MainStack.Screen name="DetectionResult" options={{ title: '判定の結果' }}>
        {({ route }) => (
          <DetectionResultPage
            familyId={familyId}
            uid={uid}
            storagePath={route.params.storagePath}
            mode={route.params.mode}
          />
        )}
      </MainStack.Screen>
      <MainStack.Screen name="Chat">
        {({ route }) => (
          <ChatPage
            familyId={route.params.familyId}
            uid={uid}
            assignmentId={route.params.assignmentId}
            itemName={route.params.itemName}
            partnerUserId={route.params.partnerUserId}
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