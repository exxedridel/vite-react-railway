import type { ChatUser } from "@/lib/testMessages";

export const SHOP_ITEM_IDS = [
  "poke-ball",
  "great-ball",
  "ultra-ball",
  "full-restore",
  "tm",
  "bicycle",
] as const;
export type ShopItemId = (typeof SHOP_ITEM_IDS)[number];
export type Wallet = {
  userId: number;
  balance: number;
  revision: number;
  items: Partial<Record<ShopItemId, number>>;
  currencyVersion: 1;
};
export type ShopPlayer = {
  user: ChatUser;
  clientId: string;
  online: boolean;
  ready: boolean;
  inBattle: boolean;
  wallet: Wallet | null;
  pending: boolean;
  pendingReset?: boolean;
};
export type GameReset = {
  requestId: string;
  userId: number;
  clientId: string;
  walletRevision: number;
  status: "pending" | "applied" | "cancelled";
};
export type ShopPurchase = {
  purchaseId: string;
  requestId: string;
  adminUserId: number;
  userId: number;
  clientId: string;
  itemId: ShopItemId;
  quantity: number;
  unitPrice: number;
  total: number;
  balanceBefore: number;
  balanceAfter: number;
  walletRevision: number;
  status: "pending" | "applied";
};
export type ShopState = {
  wallet?: Wallet;
  players?: ShopPlayer[];
  purchases?: ShopPurchase[];
  purchase?: ShopPurchase;
  resets?: GameReset[];
  reset?: GameReset;
};
export type ShopAck =
  | ({ ok: true } & ShopState)
  | { ok: false; error: { code: string; message: string } };
