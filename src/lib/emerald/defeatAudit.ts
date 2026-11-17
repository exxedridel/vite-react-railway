import type { Battle, Pokemon as SimPokemon } from "@pkmn/sim";
import { victoryLevels, type CombatDefeatReward, type RewardSide } from "@/lib/battleRewards";

type RewardMember = { side: RewardSide; captureId: string; level: number };
/** Observe confirmed native Faint events before the engine clears the source
 * of a status/volatile. Never alters damage, ordering, choices, or the PRNG. */
export function installDefeatAudit(
  battle: Battle,
  eventPrefix: string,
  member: (pokemon: SimPokemon) => RewardMember | undefined,
): { defeats: CombatDefeatReward[]; uninstall: () => void } {
  const defeats: CombatDefeatReward[] = [];
  const original = battle.runEvent;
  const descriptor = Object.getOwnPropertyDescriptor(battle, "runEvent");
  battle.runEvent = function (...args: Parameters<Battle["runEvent"]>) {
    const [event, target, source, effect] = args;
    if (event === "Faint" && target && "set" in target && "side" in target) {
      const victim = target as SimPokemon;
      const defeated = member(victim);
      const state = effect?.id === victim.status
        ? victim.statusState
        : victim.volatiles[effect?.id ?? ""];
      let author = source && typeof source === "object" ? source : undefined;
      if (state?.boardRewardSourceUnknown) author = undefined;
      if (!author || author.side === victim.side) {
        const statusAuthor = state?.boardRewardSourceUnknown ? undefined : state?.source;
        author = statusAuthor && statusAuthor.side !== victim.side ? statusAuthor : undefined;
      }
      if (!author || author.side === victim.side)
        author = (victim.side.id === "p1" ? battle.p2 : battle.p1).active[0];
      const winner = author ? member(author) : undefined;
      if (winner && defeated && winner.side !== defeated.side)
        defeats.push({
          id: `${eventPrefix}:ko:${defeats.length}`,
          winnerSide: winner.side, winnerCaptureId: winner.captureId,
          defeatedSide: defeated.side, defeatedCaptureId: defeated.captureId,
          winnerLevel: winner.level, defeatedLevel: defeated.level,
          levels: victoryLevels(winner.level, defeated.level),
        });
    }
    return original.apply(this, args);
  };
  return {
    defeats,
    uninstall() {
      if (descriptor) Object.defineProperty(battle, "runEvent", descriptor);
      else Reflect.deleteProperty(battle, "runEvent");
    },
  };
}
