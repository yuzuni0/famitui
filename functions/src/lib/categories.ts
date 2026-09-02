export const CATEGORY_IDS = [
  "dailyGoods",
  "beverage",
  "food",
  "freshFood",
  "stationery",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

// プロンプトで提示する時の不足品カテゴリ
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  dailyGoods: "日用品",
  beverage: "飲料",
  food: "食品",
  freshFood: "生鮮食品",
  stationery: "文房具",
};

export function isCategoryId(value: unknown): value is CategoryId {
  return CATEGORY_IDS.includes(value as CategoryId);
}

export function toCategoryIds(values: unknown[]): CategoryId[] {
  return [...new Set(values.filter(isCategoryId))];
}

// プロンプトに載せるカテゴリの一覧
export function categoryListForPrompt(): string {
  return CATEGORY_IDS
    .map((id) => `${id}（${CATEGORY_LABELS[id]}）`)
    .join(", ");
}
