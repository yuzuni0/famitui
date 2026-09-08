export const LEVEL_THRESHOLDS = [0, 30, 80, 160, 300];
export const MAX_LEVEL = 5;
export const IMPORTANT_REQUEST_LIMITS = [0, 0, 1, 2, 3];
export const SCORE_REQUESTED_PURCHASE = 10;
export const SCORE_UNREQUESTED_PURCHASE = 3;
export const SCORE_PROMPT_BONUS = 5;
export const PROMPT_BONUS_WINDOW_MS = 2 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
//スコアとレベルの計算処理

//依頼できるカテゴリの指定
export type ItemCategory = 'dailyGoods' | 'beverage' | 'food' | 'freshFood' | 'stationery';

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  dailyGoods: '日用品',
  beverage: '飲料',
  food: '食品',
  freshFood: '生鮮食品',
  stationery: '文房具',
};

//各カテゴリが依頼できるレベル
export const CATEGORY_UNLOCK_LEVEL: Record<ItemCategory, number> = {
  dailyGoods: 1,
  food: 1,
  beverage: 2,
  freshFood: 3,
  stationery: 4,
};

//現在のレベルで依頼できるカテゴリ
export function canRequestCategory(level: number, category: ItemCategory): boolean {
  return level >= CATEGORY_UNLOCK_LEVEL[category];
}

export function requestableCategories(level: number): ItemCategory[] {
  return (Object.keys(CATEGORY_UNLOCK_LEVEL) as ItemCategory[]).filter(category =>
    canRequestCategory(level, category),
  );
}


//スコアからレベルを求める
export function levelForScore(score: number): number {
  for (let level = MAX_LEVEL; level >= 1; level--) {
    if (score >= LEVEL_THRESHOLDS[level - 1]) {
      return level;
    }
  }
  return 1;
}

//次のレベルまでの残りスコアを返す
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

//重要な依頼の条件回数を表示
export function importantRequestLimit(level: number): number {
  return IMPORTANT_REQUEST_LIMITS[level - 1] ?? 0;
}

//日付を返す
export function todayJst(): string {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return jst.toISOString().slice(0, 10);
}
