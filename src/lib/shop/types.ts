import type { ChatUser } from "@/lib/testMessages";

export const SHOP_ITEM_IDS = [
  "poke-ball",
  "great-ball",
  "ultra-ball",
  "full-restore",
  "max-ether",
  "max-elixir",
  "tm",
  "bicycle",
] as const;
export type ShopItemId = (typeof SHOP_ITEM_IDS)[number];
export type ShopCatalog = {
  revision: number;
  prices: Record<ShopItemId, number>;
};
export type BalanceAdjustment = {
  adjustmentId: string;
  requestId: string;
  adminUserId: number;
  userId: number;
  clientId: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  walletRevision: number;
  status: "pending" | "applied";
};
export const CONSUMABLE_ITEM_IDS = [
  "full-restore",
  "max-ether",
  "max-elixir",
] as const;
export type ConsumableItemId = (typeof CONSUMABLE_ITEM_IDS)[number];
/** TM is usable only from the Party; combat choices keep the narrower union. */
export const USABLE_ITEM_IDS = [...CONSUMABLE_ITEM_IDS, "tm"] as const;
export type UsableItemId = (typeof USABLE_ITEM_IDS)[number];
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
  pendingUse?: boolean;
  pendingAdjustment?: boolean;
};
export type ItemUse = {
  requestId: string;
  userId: number;
  clientId: string;
  itemId: UsableItemId;
  captureId: string;
  moveId?: number;
  context: "party" | "local-battle";
  planHash: string;
  expectedWalletRevision: number;
  walletRevision: number;
  status: "pending" | "applied" | "cancelled";
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
  catalog?: ShopCatalog;
  adjustment?: BalanceAdjustment;
  adjustments?: BalanceAdjustment[];
  wallet?: Wallet;
  players?: ShopPlayer[];
  purchases?: ShopPurchase[];
  purchase?: ShopPurchase;
  resets?: GameReset[];
  reset?: GameReset;
  uses?: ItemUse[];
  use?: ItemUse;
};
export type ShopAck =
  | ({ ok: true } & ShopState)
  | { ok: false; error: { code: string; message: string } };
