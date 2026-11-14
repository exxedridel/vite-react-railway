import type { ChatUser } from "@/lib/testMessages";
import type { CapturedPokemon } from "@/types/pokemon";

export type CenterPokemon = {
  captureId: string;
  pokemonId: number;
  name: string;
  image: string | null;
  level: number;
  currentHp: number;
  maxHp: number;
  statuses: string[];
  moves: { id: number; name: string; currentPp: number; maxPp: number }[];
  needsHealing: boolean;
};
export type CenterPreview = {
  userId: number;
  clientId: string;
  partyRevision: number;
  partyHash: string;
  pokemons: CenterPokemon[];
};
export type CenterHeal = {
  requestId: string;
  adminUserId: number;
  userId: number;
  clientId: string;
  captureIds: string[];
  partyHash: string;
  partyRevision: number;
  planHash: string;
  centerRevision: number;
  status: "pending" | "applied" | "cancelled";
};
export type CenterPrepare = Omit<
  CenterHeal,
  "status" | "userId" | "planHash"
> & {
  playerUserId: number;
};
export type CenterLock = Omit<CenterHeal, "status"> & {
  preparedPokemons: CapturedPokemon[];
  applied?: boolean;
};

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
  captureDifficulty?: number;
  automaticOpponents?: boolean;
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
  status: "pending" | "applied" | "cancelled";
  cancelledWalletRevision?: number;
  cancelledBalance?: number;
};
export const CONSUMABLE_ITEM_IDS = [
  "full-restore",
  "max-ether",
  "max-elixir",
] as const;
export type ConsumableItemId = (typeof CONSUMABLE_ITEM_IDS)[number];
export const BALL_ITEM_IDS = ["poke-ball", "great-ball", "ultra-ball"] as const;
export type BallItemId = (typeof BALL_ITEM_IDS)[number];
export type CaptureSettings = {
  captureDifficulty: number;
  captureRevision: number;
};
export type CaptureQuote = {
  minimum: number;
  encounterId: string;
  captureDifficulty?: number;
  captureRevision?: number;
};
export type CaptureAttempt = {
  version: 1;
  attemptId: string;
  userId: number;
  clientId: string;
  ballId: BallItemId;
  minimum: number;
  captureDifficulty?: number;
  captureRevision?: number;
  encounterId: string;
  pokemonName: string;
  captureId: string;
  resultCaptureId: string;
  seed: [number, number, number, number];
  expectedCombatHash: string;
};
export type CaptureAttemptResult = {
  attemptId: string;
  userId: number;
  ballId: BallItemId;
  pokemonName: string;
  outcome: "caught" | "escaped";
  captureId?: string;
};
/** TM is usable only from the Party; combat choices keep the narrower union. */
export const USABLE_ITEM_IDS = [
  ...CONSUMABLE_ITEM_IDS,
  "tm",
  ...BALL_ITEM_IDS,
] as const;
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
  supportsBalanceAdjustments?: boolean;
  supportsCenterHealing?: boolean;
  supportsItemGifts?: boolean;
  pendingCenter?: boolean;
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
  captureRevision?: number;
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
  /** Missing on all historic paid/free store purchases. */
  kind?: "gift";
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
  status: "pending" | "applied" | "cancelled";
};
export type GiftPrepare = {
  adminUserId: number;
  itemId: ShopItemId;
  quantity: number;
};
export type ShopState = {
  centerPreview?: CenterPreview;
  centerHeal?: CenterHeal;
  centerHeals?: CenterHeal[];
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
