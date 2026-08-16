import type { Timestamp } from '@react-native-firebase/firestore';

//列挙型

//メンバーの移動手段
export type TransportMode = 'none' | 'walk' | 'bike' | 'vehicle';

//不足品の状態
export type ItemStatus = 'shortage' | 'requested' | 'completed';

//割り当ての状態
export type AssignmentStatus = 'active' | 'completed' | 'expired' | 'canceled';

//購入報告の方法
export type ReportMethod = 'manual' | 'payment';

//カテゴリ

//Firestore のコレクションではなく定数として保持する
export const CATEGORIES = [
  { id: 'dailyGoods', label: '日用品', requiredLevel: 1 },
  { id: 'beverage', label: '飲料', requiredLevel: 3 },
  { id: 'food', label: '食品', requiredLevel: 5 },
  { id: 'freshFood', label: '生鮮食品', requiredLevel: 8 },
  { id: 'stationery', label: '文房具', requiredLevel: 12 },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

//{uid}
export type UserDoc = {
  displayName: string;
  //家族に未所属の間は null
  familyId: string | null;
  createdTime: Timestamp;
};

//{familyId}
export type FamilyDoc = {
  familyName: string;
  //招待コード
  inviteCode: string;
  creatorUserId: string;
  createdTime: Timestamp;
};

//membersの{uid}
export type MemberDoc = {
  displayName: string;
  joinedTime: Timestamp;
  transportMode: TransportMode;

  transportModeExpireTime: Timestamp | null;

  busyUntilTime: Timestamp | null;
  busyLabel: string | null;
  level: number;
  score: number;
};

//inviteCodesの{code}
export type InviteCodeDoc = {
  familyId: string;
  creatorUserId: string;
  createdTime: Timestamp;
};

//itemsの{itemId}
export type ItemDoc = {
  itemName: string;
  category: CategoryId;
  status: ItemStatus;
  alternativeItemNames: string[];

  maxDistanceMeters: number | null;
  note: string;
  autoNotifyEnabled: boolean;
  creatorUserId: string;
  createdTime: Timestamp;

  requestedTime: Timestamp | null;
  requesterUserId: string | null;

  completedTime: Timestamp | null;

  activeAssignmentId: string | null;
  rejectedUserIds: string[];
};

export type AssignmentDoc = {
  itemId: string;
  assigneeUserId: string;
  status: AssignmentStatus;
  approvedTime: Timestamp;
  expireTime: Timestamp;

  completedTime: Timestamp | null;

  reportMethod: ReportMethod | null;
};