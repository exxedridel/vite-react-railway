import {
  getAccuracyMultiplier,
  getEffectiveStat,
  normalizeStages,
} from "@/lib/battleModifiers";
import { getCurrentHp, isLeveled } from "@/lib/pokemonStats";
import { MOVE_COMBAT_RULES } from "@/lib/moveCombatRules";
import { typeEffectiveness } from "@/lib/typeEffectiveness";
import type { BattleOpponent } from "@/lib/battleOpponent";
import type { CapturedPokemon } from "@/types/pokemon";
import type { PokemonMove } from "@/types/moves";
import type { BattleResult, BattleRolls } from "@/types/battle";
export function requiresConditionCheck(capture: CapturedPokemon): boolean {
  return (capture.statuses ?? []).some((status) =>
    [
      "asleep",
      "frozen",
      "paralyzed",
      "confused",
      "infatuated",
      "flinched",
      "disabled",
      "encored",
    ].includes(status),
  );
}
export function getMoveSupportReason(move: PokemonMove): string | null {
  const rule = MOVE_COMBAT_RULES[move.id];
  if (!rule || rule.mode === "manual")
    return (
      rule?.manualReason ??
      "Este movimiento todavía no está verificado para el cálculo automático. Resuélvelo manualmente según su descripción."
    );
  if (
    rule.category !== move.damageClass ||
    rule.type !== move.type ||
    (rule.mode === "damage" && rule.power !== move.power)
  )
    return "Los datos del movimiento no coinciden con la versión de reglas verificada. Requiere resolución manual.";
  if (
    rule.mode === "damage" &&
    (!Number.isFinite(move.power) || !move.power || move.power <= 0)
  )
    return "La potencia no es fija. Requiere un cálculo especial.";
  return null;
}
export function criticalChance(move: PokemonMove): number {
  const rule = MOVE_COMBAT_RULES[move.id];
  if (
    move.damageClass === "status" ||
    getMoveSupportReason(move) ||
    !rule ||
    rule.noCrit
  )
    return 0;
  if (rule.alwaysCrit) return 1;
  return [1 / 24, 1 / 8, 1 / 2, 1][Math.max(0, Math.min(3, rule.critStage))];
}
export function moveHitChance(
  capture: CapturedPokemon,
  opponent: BattleOpponent,
  move: PokemonMove,
): number | null {
  const rule = MOVE_COMBAT_RULES[move.id];
  if (!rule) return null;
  // Los movimientos de uno mismo/campo no consultan la evasión del rival.
  if (["self", "allySide", "foeSide", "all"].includes(rule.target)) return 100;
  if (rule.alwaysHit) return 100;
  if (move.id === 92 && capture.pokemon.types.includes("poison")) return 100; // Toxic moderno.
  if (move.accuracy === null || !Number.isFinite(move.accuracy)) return null;
  const own = normalizeStages(capture.pokemon.battleStages);
  const foe = normalizeStages(opponent.stages);
  return Math.max(
    0,
    Math.min(
      100,
      Math.floor(
        move.accuracy *
          getAccuracyMultiplier(
            rule.ignoreAccuracy ? 0 : own.accuracy,
            rule.ignoreEvasion ? 0 : foe.evasiveness,
          ),
      ),
    ),
  );
}
// Conserva una huella del contexto que el usuario confirmó, sin guardar una copia en Redux.
export function battleContextKey(
  capture: CapturedPokemon,
  opponent: BattleOpponent,
): string {
  return JSON.stringify([capture, opponent]);
}
export function resolveBattleMove(
  capture: CapturedPokemon,
  opponent: BattleOpponent,
  move: PokemonMove,
  rolls: BattleRolls,
  id: string,
  conditionsConfirmed = false,
): BattleResult {
  const p = capture.pokemon;
  const rule = MOVE_COMBAT_RULES[move.id];
  const r: BattleResult = {
    id,
    captureId: capture.captureId,
    attackerName: p.name,
    opponentName:
      rule?.target === "self"
        ? p.name
        : ["allySide", "foeSide", "all"].includes(rule?.target ?? "")
          ? "Campo de batalla"
          : opponent.pokemon.name,
    moveName: move.displayName,
    moveId: move.id,
    outcome: "blocked",
    message: "",
    hitChance: null,
    accuracyRoll: null,
    criticalChance: 0,
    criticalRoll: null,
    critical: false,
    damage: 0,
    appliedDamage: 0,
    wildHpBefore: null,
    wildHpAfter: null,
    level: p.level ?? 50,
    attack: null,
    defense: null,
    attackStage: null,
    defenseStage: null,
    baseDamage: null,
    stab: 1,
    effectiveness: 1,
    burn: 1,
    manualEffect: null,
  };
  const stop = (
    message: string,
    outcome: BattleResult["outcome"] = "blocked",
  ) => ({ ...r, message, outcome });
  if (
    !Object.values(rolls).every(
      (value) => Number.isFinite(value) && value >= 0 && value < 1,
    )
  )
    return stop("Tirada inválida.");
  if (!isLeveled(p) || !isLeveled(opponent.pokemon))
    return stop(
      "Primero deben cargarse los stats calculados de ambos Pokémon.",
    );
  if (getCurrentHp(p) <= 0)
    return stop("Tu Pokémon está debilitado y no puede actuar.");
  if (opponent.kind === "wild" && getCurrentHp(opponent.pokemon) <= 0)
    return stop("El salvaje está debilitado.");
  const unsupported = getMoveSupportReason(move);

  if (requiresConditionCheck(capture) && !conditionsConfirmed)
    return stop("Resuelve primero los estados que pueden impedir actuar.");
  if (capture.statuses?.includes("taunted") && move.damageClass === "status")
    return stop("Taunt impide usar movimientos de estado.");
  try {
    r.hitChance = moveHitChance(capture, opponent, move);
  } catch (error) {
    return stop(
      error instanceof Error
        ? error.message
        : "No se pudo determinar la precisión.",
      "manual",
    );
  }
  const targetsFoe = !["self", "allySide", "foeSide", "all"].includes(
    rule?.target ?? "normal",
  );
  try {
    if ((!unsupported && move.damageClass !== "status") || rule?.typeImmunity)
      r.effectiveness = typeEffectiveness(move.type, opponent.pokemon.types);
  } catch (error) {
    return stop(
      error instanceof Error ? error.message : "Tipo no compatible.",
      "manual",
    );
  }
  if (
    targetsFoe &&
    (r.effectiveness === 0 ||
      (rule?.powder && opponent.pokemon.types.includes("grass")))
  )
    return stop("El oponente es inmune a este movimiento.", "immune");
  if (targetsFoe && move.damageClass === "status") {
    const types = opponent.pokemon.types;
    if (
      (["psn", "tox"].includes(rule?.status ?? "") &&
        (types.includes("poison") || types.includes("steel"))) ||
      (rule?.status === "brn" && types.includes("fire")) ||
      (rule?.status === "par" && types.includes("electric")) ||
      (rule?.status === "frz" && types.includes("ice"))
    )
      return stop("El tipo del oponente impide aplicar este estado.", "immune");
  }
  r.accuracyRoll = r.hitChance === null ? null : rolls.accuracy * 100;
  if (r.hitChance !== null && r.accuracyRoll! >= r.hitChance)
    return stop("El movimiento falló.", "miss");
  if (unsupported || r.hitChance === null) {
    r.outcome = "manual";
    r.message =
      r.hitChance === null
        ? "Uso registrado. Resuelve manualmente el acierto y el efecto."
        : "El movimiento acertó. Efecto pendiente de aplicar manualmente.";
    r.manualEffect = [
      unsupported,
      move.description,
      "No se modificaron HP ni estados automáticamente.",
    ]
      .filter(Boolean)
      .join(" ");
    return r;
  }
  if (move.damageClass === "status") {
    r.outcome = "status";
    r.message =
      "El movimiento supera la comprobación de acierto. Resuelve su efecto en el tablero o con los controles de stats/estados.";
    r.manualEffect = move.description;
    return r;
  }
  r.criticalChance = criticalChance(move);
  r.criticalRoll = rolls.critical;
  r.critical = rolls.critical < r.criticalChance;
  const own = normalizeStages(p.battleStages),
    foe = normalizeStages(opponent.stages);
  const attackName =
    move.damageClass === "physical" ? "attack" : "special-attack";
  const defenseName =
    move.damageClass === "physical" ? "defense" : "special-defense";
  const attackBase = p.stats.find((s) => s.name === attackName)?.value;
  const defenseBase = opponent.pokemon.stats.find(
    (s) => s.name === defenseName,
  )?.value;
  if (
    attackBase === undefined ||
    defenseBase === undefined ||
    attackBase < 1 ||
    defenseBase < 1
  )
    return stop("Stats ofensivos o defensivos inválidos.");
  r.attackStage = r.critical ? Math.max(0, own[attackName]) : own[attackName];
  r.defenseStage = r.critical
    ? Math.min(0, foe[defenseName])
    : foe[defenseName];
  r.attack = getEffectiveStat(attackBase, r.attackStage);
  r.defense = getEffectiveStat(defenseBase, r.defenseStage);
  r.baseDamage =
    Math.floor(
      ((Math.floor((2 * p.level) / 5) + 2) * move.power! * r.attack) /
        (50 * r.defense),
    ) + 2;
  r.stab = p.types.includes(move.type) ? 1.5 : 1;
  r.burn =
    move.damageClass === "physical" && capture.statuses?.includes("burned")
      ? 0.5
      : 1;
  r.damage = Math.max(
    1,
    Math.floor(
      r.baseDamage * r.stab * r.effectiveness * (r.critical ? 1.5 : 1) * r.burn,
    ),
  );
  if (!Number.isSafeInteger(r.damage))
    return stop("Daño fuera del rango numérico permitido.");
  r.outcome = "hit";
  r.message = r.critical ? "¡Golpe crítico!" : "El movimiento acertó.";
  if (rule.hasExtraEffect)
    r.manualEffect = rule.manualEffectNote
      ? `Solo se resolvió el daño directo. ${rule.manualEffectNote}`
      : `Solo se resolvió el daño directo. Efectos adicionales, drenaje, retroceso o cambios de stats se resuelven manualmente: ${move.description}`;
  return r;
}

/** Invierte atacante/defensor sin modificar los objetos originales de Redux. */
export function battleParticipants(
  capture: CapturedPokemon,
  opponent: BattleOpponent,
  side: "player" | "opponent" = "player",
) {
  if (side === "player") return { attacker: capture, defender: opponent };
  return {
    attacker: {
      captureId: capture.captureId,
      pokemon: {
        ...opponent.pokemon,
        battleStages: normalizeStages(opponent.stages),
      },
      statuses: opponent.statuses ?? [],
      moves: opponent.moves,
    } satisfies CapturedPokemon,
    defender: {
      pokemon: capture.pokemon,
      stages: normalizeStages(capture.pokemon.battleStages),
      kind: "trainer" as const,
    },
  };
}
