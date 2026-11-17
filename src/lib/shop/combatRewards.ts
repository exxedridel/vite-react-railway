import type { PartyState } from "@/slices/partySlice";
import type { BattleOpponent } from "@/lib/battleOpponent";
import type { CatchTierColor } from "@/lib/captureRates";

export const TRAINER_REWARD_AMOUNTS: Record<CatchTierColor, number> = {
  pink: 200,
  green: 300,
  blue: 400,
  yellow: 500,
  red: 600,
  gold: 0,
};
export type LocalTrainerRewardClaim = {
  encounterId: string;
  epoch: number;
  color: CatchTierColor;
};
export type CombatReward = {
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
  status: "credited" | "rejected";
  reason?: "STALE_GAME";
};
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
    color(value.color)
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
    !["credited", "rejected"].includes(String(value.status)) ||
    (value.status === "rejected"
      ? value.reason !== "STALE_GAME" || value.amount !== 0
      : value.reason !== undefined)
  )
    return false;
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

/** Called inside the same checked Party write as the completed victory. Money
 * remains canonical on Nest; this only records the durable claim to retry. */
export function queueLocalTrainerReward(
  party: PartyState,
  opponent: BattleOpponent,
): void {
  const metadata = opponent.rewards;
  if (
    opponent.kind !== "trainer" ||
    !metadata ||
    metadata.version !== 1 ||
    !opponent.encounterId ||
    !TRAINER_REWARD_AMOUNTS[metadata.color]
  )
    return;
  const claim: LocalTrainerRewardClaim = {
    encounterId: opponent.encounterId,
    epoch: metadata.epoch,
    color: metadata.color,
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

/** Only an exact authenticated terminal receipt may remove a pending claim. */
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
