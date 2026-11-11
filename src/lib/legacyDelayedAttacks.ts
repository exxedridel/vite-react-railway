import type { CapturedPokemon } from "@/types/pokemon";
import type { BattleResult } from "@/types/battle";
import type { BattleOpponent } from "./battleOpponent";
import type { BattleField } from "./battleField";
import { getAccuracyMultiplier, normalizeStages } from "./battleModifiers";
import { getCurrentHp } from "./pokemonStats";

/** Tick only completed turns, not manual corrections to the displayed counter.
 * Damage and random rolls were fixed by the original prepared move action.
 */
export function finishLegacyDelayedAttacks(
  field: BattleField,
  pokemons: CapturedPokemon[],
  opponent: BattleOpponent,
  activeCaptureId: string,
  eventId: string,
): { results: BattleResult[]; details: string[] } {
  const results: BattleResult[] = [];
  const details: string[] = [];
  const remaining = [];
  for (const original of field.pendingDelayedAttacks ?? []) {
    const attack = { ...original, remainingTurns: original.remainingTurns - 1 };
    if (attack.remainingTurns > 0) {
      remaining.push(attack);
      details.push(
        `${attack.moveName}: faltan ${attack.remainingTurns} finalizaciones de turno para llegar a la posición ${attack.targetSide === "player" ? "del jugador" : "rival"}.`,
      );
      continue;
    }
    const target =
      attack.targetSide === "player"
        ? pokemons.find((capture) => capture.captureId === activeCaptureId)
        : opponent;
    const source =
      attack.source.side === "player"
        ? pokemons.find(
            (capture) =>
              capture.captureId ===
              (attack.source.side === "player" ? attack.source.captureId : ""),
          )
        : opponent;
    const sourceStages =
      source === opponent ? opponent.stages : source?.pokemon.battleStages;
    const targetStages =
      target === opponent ? opponent.stages : target?.pokemon.battleStages;
    const sourceAccuracy = source
      ? normalizeStages(sourceStages).accuracy
      : attack.sourceAccuracyStage;
    const hitChance = Math.max(
      0,
      Math.min(
        100,
        Math.floor(
          attack.accuracy *
            getAccuracyMultiplier(
              sourceAccuracy,
              normalizeStages(targetStages).evasiveness,
            ),
        ),
      ),
    );
    const hpBefore = target ? getCurrentHp(target.pokemon) : 0;
    const result: BattleResult = {
      id: `${eventId}:future:${attack.targetSide}`,
      captureId:
        attack.source.side === "player"
          ? attack.source.captureId
          : activeCaptureId,
      actorSide: attack.source.side,
      attackerName: attack.attackerName,
      opponentName: target?.pokemon.name ?? "Posición vacía",
      moveName: attack.moveName,
      moveId: attack.moveId,
      outcome: "blocked",
      message: "El ataque futuro llegó a una posición sin Pokémon disponible.",
      hitChance,
      accuracyRoll: attack.accuracyRoll,
      criticalChance: 0,
      criticalRoll: null,
      critical: false,
      damage: 0,
      appliedDamage: 0,
      wildHpBefore:
        attack.targetSide === "opponent" && opponent.kind === "wild"
          ? hpBefore
          : null,
      wildHpAfter: null,
      targetHpBefore: hpBefore,
      targetHpAfter: hpBefore,
      level: attack.level,
      attackStat: attack.attackStat,
      defenseStat: attack.defenseStat,
      attack: attack.attack,
      defense: attack.defense,
      attackStage: attack.attackStage,
      defenseStage: attack.defenseStage,
      baseDamage: attack.baseDamage,
      stab: 1,
      effectiveness: 1,
      burn: attack.burn,
      damageType: "???",
      manualEffect: null,
      effectMessages: [],
      hpChanges: [],
    };
    if (target && hpBefore > 0) {
      if (attack.accuracyRoll >= hitChance) {
        result.outcome = "miss";
        result.message = `${attack.moveName} llegó, pero falló.`;
      } else {
        const appliedDamage = Math.min(hpBefore, attack.damage);
        target.pokemon.stats.find((stat) => stat.name === "hp")!.value -=
          appliedDamage;
        result.outcome = "hit";
        result.damage = attack.damage;
        result.appliedDamage = appliedDamage;
        result.targetHpAfter = hpBefore - appliedDamage;
        if (result.wildHpBefore !== null)
          result.wildHpAfter = hpBefore - appliedDamage;
        result.hpChanges!.push({
          role: "target",
          name: target.pokemon.name,
          before: hpBefore,
          after: hpBefore - appliedDamage,
        });
        result.message = `${attack.moveName} de ${attack.attackerName} alcanzó a ${target.pokemon.name}: ${appliedDamage} HP de daño diferido.`;
      }
    }
    details.push(result.message);
    results.push(result);
  }
  if (field.pendingDelayedAttacks)
    field.pendingDelayedAttacks = remaining.length ? remaining : undefined;
  return { results, details };
}
