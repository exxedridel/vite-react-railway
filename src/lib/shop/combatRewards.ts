import type { PartyState } from "@/slices/partySlice";
import type { BattleOpponent } from "@/lib/battleOpponent";
import type { CatchTierColor } from "@/lib/captureRates";
import type { GymBadgeId } from "@/lib/trainerBag";
import type { LocalBattleOutcome } from "@/lib/battleRewards";

export const TRAINER_REWARD_AMOUNTS: Record<CatchTierColor, number> = {
  pink: 200,
  green: 300,
  blue: 400,
  yellow: 500,
  red: 600,
  gold: 0,
};
export const TRAINER_PENALTY_AMOUNTS: Record<CatchTierColor, number> = {
  pink: 0,
  green: 100,
  blue: 200,
  yellow: 300,
  red: 400,
  gold: 0,
};
export type LocalTrainerRewardClaim = {
  encounterId: string;
  epoch: number;
  color: CatchTierColor;
  /** Explicit opt-in for a loss; absent on historical victory claims. */
  penaltyVersion?: 1;
};
export type CombatReward = {
  penaltyVersion?: 1;
  nominalAmount?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  rewardBundleVersion?: 1;
  badgeId?: GymBadgeId;
  items?: { tm: 1 };
  rewardId: string;
  userId: number;
  source: "local-trainer" | "admin-trainer";
  encounterId?: string;
  battleId?: string;
  epoch: number;
  color?: CatchTierColor;
  presetId?: string;
  amount: number;
  walletRevision: number;
  status: "credited" | "debited" | "rejected";
  reason?: "STALE_GAME";
};
export function trainerPresetPenalty(presetId: string): number | undefined {
  const amounts: Record<string, number> = {
    "kanto-brock": 50,
    "kanto-misty": 100,
    "kanto-surge": 200,
    "kanto-erika": 300,
    "kanto-koga": 400,
    "kanto-sabrina": 400,
    "kanto-blaine": 500,
    "kanto-giovanni": 500,
  };
  if (Object.prototype.hasOwnProperty.call(amounts, presetId))
    return amounts[presetId];
  if (
    ["kanto-lorelei", "kanto-bruno", "kanto-agatha", "kanto-lance"].includes(
      presetId,
    )
  )
    return 500;
  if (/^kanto-rival-lab-(grass|fire|water)$/.test(presetId)) return 50;
  if (/^kanto-rival-champion-(grass|fire|water)$/.test(presetId)) return 500;
  return undefined;
}
export function trainerGymBadge(presetId: string): GymBadgeId | undefined {
  const badges: Record<string, GymBadgeId> = {
    "kanto-brock": "boulder",
    "kanto-misty": "cascade",
    "kanto-surge": "thunder",
    "kanto-erika": "rainbow",
    "kanto-koga": "soul",
    "kanto-sabrina": "marsh",
    "kanto-blaine": "volcano",
    "kanto-giovanni": "earth",
  };
  return Object.prototype.hasOwnProperty.call(badges, presetId)
    ? badges[presetId]
    : undefined;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[\w.:-]{1,128}$/.test(value);
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const color = (value: unknown): value is CatchTierColor =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(TRAINER_REWARD_AMOUNTS, value);
export function validLocalRewardClaim(
  value: unknown,
): value is LocalTrainerRewardClaim {
  return (
    record(value) &&
    id(value.encounterId) &&
    integer(value.epoch) &&
    color(value.color) &&
    (value.penaltyVersion === undefined || value.penaltyVersion === 1)
  );
}
export function validLocalRewardOutbox(
  value: unknown,
): value is LocalTrainerRewardClaim[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((claim) => {
    if (!validLocalRewardClaim(claim) || ids.has(claim.encounterId))
      return false;
    ids.add(claim.encounterId);
    return true;
  });
}
export function validCombatReward(value: unknown): value is CombatReward {
  if (
    !record(value) ||
    typeof value.rewardId !== "string" ||
    value.rewardId.length > 134 ||
    !integer(value.userId) ||
    value.userId < 1 ||
    !integer(value.epoch) ||
    !integer(value.amount) ||
    !integer(value.walletRevision) ||
    !["credited", "debited", "rejected"].includes(String(value.status)) ||
    (value.status === "rejected"
      ? value.reason !== "STALE_GAME" || value.amount !== 0
      : value.reason !== undefined)
  )
    return false;
  if (value.penaltyVersion !== undefined && value.penaltyVersion !== 1)
    return false;
  if (value.penaltyVersion === 1) {
    if (
      !integer(value.nominalAmount) ||
      value.amount > value.nominalAmount ||
      value.status === "credited" ||
      value.rewardBundleVersion !== undefined ||
      value.badgeId !== undefined ||
      value.items !== undefined
    )
      return false;
    if (
      (value.balanceBefore !== undefined || value.balanceAfter !== undefined) &&
      (!integer(value.balanceBefore) ||
        !integer(value.balanceAfter) ||
        value.balanceBefore - value.amount !== value.balanceAfter)
    )
      return false;
    if (value.source === "local-trainer")
      return (
        id(value.encounterId) &&
        value.rewardId === `local:${value.encounterId}` &&
        color(value.color) &&
        value.nominalAmount === TRAINER_PENALTY_AMOUNTS[value.color]
      );
    const expected =
      typeof value.presetId === "string"
        ? trainerPresetPenalty(value.presetId)
        : undefined;
    return (
      value.source === "admin-trainer" &&
      id(value.battleId) &&
      id(value.presetId) &&
      value.rewardId === `admin:${value.battleId}` &&
      expected !== undefined &&
      value.nominalAmount === expected
    );
  }
  if (
    value.nominalAmount !== undefined ||
    value.status === "debited" ||
    value.balanceBefore !== undefined ||
    value.balanceAfter !== undefined
  )
    return false;
  if (
    value.rewardBundleVersion !== undefined &&
    value.rewardBundleVersion !== 1
  )
    return false;
  if (
    value.rewardBundleVersion === undefined &&
    (value.badgeId !== undefined || value.items !== undefined)
  )
    return false;
  if (value.rewardBundleVersion === 1) {
    if (value.source !== "admin-trainer") return false;
    const expected =
      typeof value.presetId === "string"
        ? trainerGymBadge(value.presetId)
        : undefined;
    if (value.status === "credited" && expected) {
      if (
        value.badgeId !== expected ||
        !record(value.items) ||
        Object.keys(value.items).length !== 1 ||
        value.items.tm !== 1
      )
        return false;
    } else if (value.badgeId !== undefined || value.items !== undefined)
      return false;
  }
  if (value.source === "local-trainer")
    return (
      id(value.encounterId) &&
      value.rewardId === `local:${value.encounterId}` &&
      color(value.color) &&
      (value.status !== "credited" ||
        value.amount === TRAINER_REWARD_AMOUNTS[value.color])
    );
  return (
    value.source === "admin-trainer" &&
    id(value.battleId) &&
    id(value.presetId) &&
    value.rewardId === `admin:${value.battleId}`
  );
}

/** Called inside the same checked Party write as the completed outcome. Money
 * remains canonical on Nest; this only records the durable claim to retry. */
export function queueLocalTrainerReward(
  party: PartyState,
  opponent: BattleOpponent,
  outcome: LocalBattleOutcome | "forfeit" = "win",
): void {
  const metadata = opponent.rewards;
  const penalty = outcome === "lose" || outcome === "forfeit";
  if (
    opponent.kind !== "trainer" ||
    !metadata ||
    metadata.version !== 1 ||
    !opponent.encounterId ||
    (penalty
      ? metadata.lossPenaltyVersion !== 1
      : outcome !== "win" || !TRAINER_REWARD_AMOUNTS[metadata.color])
  )
    return;
  const claim: LocalTrainerRewardClaim = {
    encounterId: opponent.encounterId,
    epoch: metadata.epoch,
    color: metadata.color,
    ...(penalty ? { penaltyVersion: 1 as const } : {}),
  };
  if (!validLocalRewardClaim(claim)) return;
  party.localRewardOutbox ??= [];
  if (
    !party.localRewardOutbox.some(
      (entry) => entry.encounterId === claim.encounterId,
    )
  )
    party.localRewardOutbox.push(claim);
}

/** Only an authenticated terminal receipt for this identity may remove a claim.
 * Multiple devices can report different outcomes; the first central settlement
 * wins, so its exact identity also terminates a conflicting later claim. */
export function matchingLocalReward(
  claim: LocalTrainerRewardClaim,
  receipt: CombatReward,
  userId: number,
): boolean {
  return (
    validCombatReward(receipt) &&
    receipt.userId === userId &&
    receipt.source === "local-trainer" &&
    receipt.encounterId === claim.encounterId &&
    receipt.color === claim.color &&
    receipt.epoch === claim.epoch
  );
}
