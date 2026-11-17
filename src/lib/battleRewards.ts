import type { CapturedPokemon } from "@/types/pokemon";
import type { PartyState } from "@/slices/partySlice";
import { changeLevel, getCurrentHp, isLeveled } from "@/lib/pokemonStats";

export type RewardSide = "a" | "b";
/** One actual defeat, rather than a comparison of the HP at the end of a turn.
 * The same victim can earn another event after it has genuinely been revived. */
export type CombatDefeatReward = {
  id: string;
  winnerSide: RewardSide;
  winnerCaptureId: string;
  defeatedSide: RewardSide;
  defeatedCaptureId: string;
  winnerLevel: number;
  defeatedLevel: number;
  levels: 1 | 2;
};
export type CombatRewardLedger = { version: 1; defeats: CombatDefeatReward[] };
export type LocalBattleRewardLedger = CombatRewardLedger & {
  encounterId: string;
  appliedCount: number;
};
export type LocalBattleOutcome = "win" | "lose" | "draw" | "escape";

export function victoryLevels(winnerLevel: number, defeatedLevel: number): 1 | 2 {
  return defeatedLevel > winnerLevel ? 2 : 1;
}
export function rewardedLevel(level: number, levels: number): number {
  return Math.min(100, level + levels);
}
export function validCombatDefeatReward(value: unknown): value is CombatDefeatReward {
  if (!value || typeof value !== "object") return false;
  const reward = value as CombatDefeatReward;
  return typeof reward.id === "string" && !!reward.id && reward.id.length <= 200 &&
    ["a", "b"].includes(reward.winnerSide) && ["a", "b"].includes(reward.defeatedSide) &&
    reward.winnerSide !== reward.defeatedSide &&
    typeof reward.winnerCaptureId === "string" && !!reward.winnerCaptureId && reward.winnerCaptureId.length <= 128 &&
    typeof reward.defeatedCaptureId === "string" && !!reward.defeatedCaptureId && reward.defeatedCaptureId.length <= 128 &&
    Number.isSafeInteger(reward.winnerLevel) && reward.winnerLevel >= 1 && reward.winnerLevel <= 100 &&
    Number.isSafeInteger(reward.defeatedLevel) && reward.defeatedLevel >= 1 && reward.defeatedLevel <= 100 &&
    reward.levels === victoryLevels(reward.winnerLevel, reward.defeatedLevel);
}
export function validCombatRewardLedger(value: unknown): value is CombatRewardLedger {
  if (!value || typeof value !== "object") return false;
  const ledger = value as CombatRewardLedger;
  if (ledger.version !== 1 || !Array.isArray(ledger.defeats) || ledger.defeats.length > 8192)
    return false;
  const ids = new Set<string>();
  for (const reward of ledger.defeats) {
    if (!validCombatDefeatReward(reward) || ids.has(reward.id)) return false;
    ids.add(reward.id);
  }
  return true;
}
export function validLocalBattleRewards(value: unknown): value is LocalBattleRewardLedger {
  if (!validCombatRewardLedger(value)) return false;
  const ledger = value as LocalBattleRewardLedger;
  return typeof ledger.encounterId === "string" && !!ledger.encounterId && ledger.encounterId.length <= 200 &&
    Number.isSafeInteger(ledger.appliedCount) && ledger.appliedCount >= 0 && ledger.appliedCount <= ledger.defeats.length;
}
export function levelRewardTotal(ledger: CombatRewardLedger | undefined, side: RewardSide, captureId: string): number {
  return (ledger?.defeats ?? []).reduce((total, reward) =>
    total + (reward.winnerSide === side && reward.winnerCaptureId === captureId ? reward.levels : 0), 0);
}
export function localRewardEncounter(party: Pick<PartyState, "opponent">): string | undefined {
  const opponent = party.opponent;
  return opponent ? opponent.encounterId ?? `${opponent.kind ?? "trainer"}:${opponent.pokemon.id}` : undefined;
}
/** Called in the same checked Party write as the actual engine action. */
export function recordLocalDefeats(party: PartyState, defeats: CombatDefeatReward[]): void {
  if (!defeats.length) return;
  const encounterId = localRewardEncounter(party);
  if (!encounterId) return;
  if (party.localBattleRewards?.encounterId !== encounterId)
    party.localBattleRewards = { version: 1, encounterId, defeats: [], appliedCount: 0 };
  const ledger = party.localBattleRewards!;
  for (const reward of defeats)
    if (!ledger.defeats.some((previous) => previous.id === reward.id)) ledger.defeats.push(reward);
}
/** Finalization applies only the earned, not-yet-saved events. Battle stats and
 * comparisons remain frozen until here. A fainted recipient stays fainted. */
export function finishLocalBattleRewards(party: PartyState): void {
  const ledger = party.localBattleRewards;
  if (!ledger || ledger.encounterId !== localRewardEncounter(party)) return;
  const pending = ledger.defeats.slice(ledger.appliedCount);
  for (const capture of party.pokemons) {
    if (!isLeveled(capture.pokemon)) continue;
    const levels = pending.reduce((sum, reward) => sum +
      (reward.winnerSide === "a" && reward.winnerCaptureId === capture.captureId ? reward.levels : 0), 0);
    if (levels && capture.pokemon.level < 100)
      capture.pokemon = changeLevel(capture.pokemon, rewardedLevel(capture.pokemon.level, levels));
  }
  ledger.appliedCount = ledger.defeats.length;
}
export function recordLocalOpponentDefeat(party: PartyState, winnerCaptureId: string, eventId: string): void {
  const winner = party.pokemons.find((capture) => capture.captureId === winnerCaptureId);
  const opponent = party.opponent;
  if (!winner || !opponent || !isLeveled(winner.pokemon) || !isLeveled(opponent.pokemon)) return;
  recordLocalDefeats(party, [{
    id: eventId,
    winnerSide: "a", winnerCaptureId,
    defeatedSide: "b", defeatedCaptureId: "opponent",
    winnerLevel: winner.pokemon.level,
    defeatedLevel: opponent.pokemon.level,
    levels: victoryLevels(winner.pokemon.level, opponent.pokemon.level),
  }]);
}
export function activeRewardCapture(party: PartyState): CapturedPokemon | undefined {
  return party.pokemons.find((capture) => capture.captureId === party.battleField?.activeCaptureId)
    ?? party.pokemons.find((capture) => getCurrentHp(capture.pokemon) > 0);
}
