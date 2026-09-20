import type { Timestamp } from '@react-native-firebase/firestore';
import { CATEGORIES, TRANSPORT_MODES } from '../types/firestore';
import type { CategoryId, TransportMode } from '../types/firestore';

//カテゴリのidから表示名を取得する
export function categoryLabel(category: CategoryId): string {
  return CATEGORIES.find(entry => entry.id === category)?.label ?? category;
}

export function transportModeLabel(mode: TransportMode): string {
  return TRANSPORT_MODES.find(entry => entry.id === mode)?.label ?? mode;
}

export type CategorySection<T> = {
  title: string;
  data: T[];
};

//カテゴリごとに分ける
export function groupByCategory<T>(
  entries: T[],
  categoryOf: (entry: T) => CategoryId,
): CategorySection<T>[] {
  const sections: CategorySection<T>[] = [];
  for (const category of CATEGORIES) {
    const data = entries.filter(entry => categoryOf(entry) === category.id);
    if (data.length > 0) {
      sections.push({ title: category.label, data });
    }
  }
  return sections;
}

//月日も表示する
export function formatDateTime(value: Timestamp): string {
  const date = value.toDate();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

//距離の表示
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

//所要時間の表示
export function formatDuration(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes}分`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = String(minutes % 60).padStart(2, '0');
  return `${hours}時間${rest}分`;
}