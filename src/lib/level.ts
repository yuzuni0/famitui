import type { CategoryId, MemberDoc } from '../types/firestore';
//スコアとレベルの計算処理

const LEVEL_THRESHOLDS = [0, 30, 80, 160, 300];
export const MAX_LEVEL = 5;
const IMPORTANT_REQUEST_LIMITS = [0, 0, 1, 2, 3];
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

//各カテゴリが依頼できるレベル
export const CATEGORY_UNLOCK_LEVEL: Record<CategoryId, number> = {
  dailyGoods: 1,
  food: 1,
  beverage: 2,
  freshFood: 3,
  stationery: 4,
};

//現在のレベルで依頼できるカテゴリ
export function canRequestCategory(level: number, category: CategoryId): boolean {
  return level >= CATEGORY_UNLOCK_LEVEL[category];
}

export function requestableCategories(level: number): CategoryId[] {
  return (Object.keys(CATEGORY_UNLOCK_LEVEL) as CategoryId[]).filter(category =>
    canRequestCategory(level, category),
  );
}

//スコアからレベルを求める
function levelForScore(score: number): number {
  for (let level = MAX_LEVEL; level >= 1; level--) {
    if (score >= LEVEL_THRESHOLDS[level - 1]) {
      return level;
    }
  }
  return 1;
}

//次のレベルまでの進捗を返す
export function progressToNextLevel(score: number): {
  current: number;
  next: number | null;
  ratio: number;
} {
  const current = levelForScore(score);
  if (current >= MAX_LEVEL) {
    return { current, next: null, ratio: 1 };
  }
  const from = LEVEL_THRESHOLDS[current - 1];
  const to = LEVEL_THRESHOLDS[current];
  const ratio = Math.min(1, Math.max(0, (score - from) / (to - from)));
  return { current, next: current + 1, ratio };
}

//重要な依頼の上限回数
export function importantRequestLimit(level: number): number {
  return IMPORTANT_REQUEST_LIMITS[level - 1] ?? 0;
}

//重要な依頼の残数
export function remainingImportantRequests(
  member: Pick<MemberDoc, 'level' | 'importantRequestDate' | 'importantRequestCount'>,
): number {
  const limit = importantRequestLimit(member.level);
  if (member.importantRequestDate !== todayJst()) {
    return limit;
  }
  return Math.max(0, limit - (member.importantRequestCount ?? 0));
}

//日付を返す
export function todayJst(): string {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}