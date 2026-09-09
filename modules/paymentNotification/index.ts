import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type LastPayment = { time: number; packageName: string; text: string };

type PaymentNotificationModule = {
  isPermissionGranted(): boolean;
  openSettings(): void;
  getLastPayment(): LastPayment | null;
  clearLastPayment(): void;
};

// Androidのネイティブモジュールを取得する
const nativeModule = Platform.OS === 'android' ? requireNativeModule<PaymentNotificationModule>('PaymentNotification') : null;

export function isPermissionGranted(): boolean {
  if (!nativeModule) return false;
  return nativeModule.isPermissionGranted();
}

export function openSettings(): void {
  nativeModule?.openSettings();
}

export function getLastPayment(): LastPayment | null {
  if (!nativeModule) return null;
  return nativeModule.getLastPayment();
}

export function clearLastPayment(): void {
  nativeModule?.clearLastPayment();
}