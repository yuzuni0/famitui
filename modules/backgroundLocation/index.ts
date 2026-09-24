import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export const TASK_NAME = 'BackgroundLocationEvent';

export type StartOptions = { notificationTitle: string; notificationBody: string; distanceMeters: number };

export type StoreInput = { storeId: string; storeName: string; latitude: number; longitude: number; categories: string[] };

export type RegisteredStore = StoreInput & { radius: number };

export type Position = { latitude: number; longitude: number };

export type BackgroundLocationEvent =
  | { type: 'geofence'; action: 'enter' | 'exit'; storeId: string; storeName: string; categories: string[]; latitude: number; longitude: number }
  | { type: 'activity'; mode: 'walk' | 'bike' | 'vehicle' | 'none' }
  | { type: 'location'; latitude: number; longitude: number };

type BackgroundLocationModule = {
  isEnabled(): boolean;
  hasActivityPermission(): boolean;
  start(options: StartOptions): Promise<void>;
  stop(): Promise<void>;
  replaceGeofences(stores: StoreInput[], radius: number): Promise<void>;
  getRegisteredStores(): RegisteredStore[];
  getCurrentPosition(): Promise<Position>;
  getValue(key: string): string | null;
  setValue(key: string, value: string | null): void;
};

// Androidのモジュールを取得する
const nativeModule = Platform.OS === 'android' ? requireNativeModule<BackgroundLocationModule>('BackgroundLocation') : null;

export function isEnabled(): boolean {
  if (!nativeModule) return false;
  return nativeModule.isEnabled();
}

export function hasActivityPermission(): boolean {
  if (!nativeModule) return false;
  return nativeModule.hasActivityPermission();
}

export async function start(options: StartOptions): Promise<void> {
  await nativeModule?.start(options);
}

export async function stop(): Promise<void> {
  await nativeModule?.stop();
}

export async function replaceGeofences(stores: StoreInput[], radius: number): Promise<void> {
  await nativeModule?.replaceGeofences(stores, radius);
}

export function getRegisteredStores(): RegisteredStore[] {
  if (!nativeModule) return [];
  return nativeModule.getRegisteredStores();
}

export async function getCurrentPosition(): Promise<Position> {
  if (!nativeModule) throw new Error('Android でのみ使用できます');
  return nativeModule.getCurrentPosition();
}

export function getValue(key: string): string | null {
  if (!nativeModule) return null;
  return nativeModule.getValue(key);
}

export function setValue(key: string, value: string | null): void {
  nativeModule?.setValue(key, value);
}