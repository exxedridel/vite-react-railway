import {
  getAccuracyMultiplier,
  getEffectiveStat,
  normalizeStages,
} from "@/lib/battleModifiers";
import { getCurrentHp, getMaxHp, isLeveled } from "@/lib/pokemonStats";
import {
  CURATED_MOVE_CATALOG,
  getCuratedMove,
  getMoveRequirementFailure,
  SLEEP_TALK_EXCLUDED,
  NUMERIC_MOVE_INPUTS,
} from "@/lib/curatedMoveCatalog";
import { typeEffectiveness } from "@/lib/typeEffectiveness";
import type { BattleOpponent } from "@/lib/battleOpponent";
import type { CapturedPokemon } from "@/types/pokemon";
import type { PokemonMove } from "@/types/moves";
import type { BattleResult, BattleRolls } from "@/types/battle";
import type { MoveExecutionOptions } from "./moveCatalogTypes";
export function requiresConditionCheck(
  capture: CapturedPokemon,
  moveId?: number,
): boolean {
  return (capture.statuses ?? []).some(
    (s) =>
      [
        "asleep",
        "frozen",
        "paralyzed",
        "confused",
        "infatuated",
        "flinched",
        "disabled",
        "encored",
      ].includes(s) &&
      !(s === "asleep" && [173, 214].includes(moveId ?? 0)) &&
      !(s === "frozen" && [172, 221].includes(moveId ?? 0)),
  );
}
export function getMoveSupportReason(move: PokemonMove): string | null {
  const e = CURATED_MOVE_CATALOG[move.id];
  return !e
    ? "Movimiento fuera del catálogo Gen 3."
    : e.automation === "manual"
      ? (e.manualReason ?? "Efecto manual.")
      : null;
}
const fixedHandlers = new Set([
  "fixed20",
  "fixed40",
  "level",
  "psywave",
  "halfHp",
  "endeavor",
  "ohko",
  "counter",
  "mirrorCoat",
  "bide",
]);
export function criticalChance(move: PokemonMove): number {
  const e = CURATED_MOVE_CATALOG[move.id];
  if (
    !e ||
    e.automation === "manual" ||
    e.parameters.damageClass === "status" ||
    fixedHandlers.has(e.handler ?? "") ||
    e.handler === "spitUp"
  )
    return 0;
  return [1 / 16, 1 / 8, 1 / 4, 1 / 3, 1 / 2][Math.min(4, e.critStage)];
}
export function moveHitChance(
  c: CapturedPokemon,
  o: BattleOpponent,
  move: PokemonMove,
  options: MoveExecutionOptions = {},
): number | null {
  const e = CURATED_MOVE_CATALOG[move.id];
  if (!e) return null;
  if (e.handler === "ohko")
    return (c.pokemon.level ?? 50) < (o.pokemon.level ?? 50)
      ? 0
      : Math.min(100, 30 + (c.pokemon.level ?? 50) - (o.pokemon.level ?? 50));
  if (move.id === 228 && options.powerBoostConfirmed) return 100;
  if (e.target === "self" || e.parameters.accuracy === null) return 100;
  if (move.id === 87 && options.weather === "rain") return 100;
  const accuracy =
    move.id === 87 && options.weather === "sun" ? 50 : e.parameters.accuracy;
  return Math.max(
    0,
    Math.min(
      100,
      Math.floor(
        accuracy *
          getAccuracyMultiplier(
            normalizeStages(c.pokemon.battleStages).accuracy,
            normalizeStages(o.stages).evasiveness,
          ),
      ),
    ),
  );
}
export function battleContextKey(
  c: CapturedPokemon,
  o: BattleOpponent,
): string {
  return JSON.stringify([c, o]);
}
export function battleParticipants(
  c: CapturedPokemon,
  o: BattleOpponent,
  side: "player" | "opponent" = "player",
) {
  if (side === "player") return { attacker: c, defender: o };
  return {
    attacker: {
      captureId: c.captureId,
      pokemon: { ...o.pokemon, battleStages: normalizeStages(o.stages) },
      statuses: o.statuses ?? [],
      moves: o.moves,
    } satisfies CapturedPokemon,
    defender: {
      pokemon: c.pokemon,
      statuses: c.statuses ?? [],
      stages: normalizeStages(c.pokemon.battleStages),
      kind: "trainer" as const,
    },
  };
}
export function resolveBattleMove(
  c: CapturedPokemon,
  o: BattleOpponent,
  raw: PokemonMove,
  rolls: BattleRolls,
  id: string,
  conditionsConfirmed = false,
  options: MoveExecutionOptions = {},
  called = false,
): BattleResult {
  const move = getCuratedMove(raw),
    e = CURATED_MOVE_CATALOG[move.id],
    p = c.pokemon,
    q = o.pokemon;
  const r: BattleResult = {
    id,
    captureId: c.captureId,
    attackerName: p.name,
    opponentName: q.name,
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
    criticalMultiplier: 2,
    effectMessages: [],
    executionOptions: options,
  };
  const stop = (
    message: string,
    outcome: BattleResult["outcome"] = "blocked",
  ) => ({ ...r, message, outcome });
  if (
    ![rolls.accuracy, rolls.critical, ...(rolls.extra ?? [])].every(
      (v) => Number.isFinite(v) && v >= 0 && v < 1,
    )
  )
    return stop("Tirada inválida.");
  const random = (index: number) => rolls.extra?.[index] ?? 0.5;
  if (!isLeveled(p) || !isLeveled(q))
    return stop("Faltan estadísticas calculadas.");
  if (getCurrentHp(p) <= 0 || getCurrentHp(q) <= 0)
    return stop("Un combatiente está debilitado.");
  if (!e) return stop("Movimiento fuera del catálogo Gen 3.", "manual");
  if (requiresConditionCheck(c, called ? 214 : move.id) && !conditionsConfirmed)
    return stop("Resuelve primero los estados que pueden impedir actuar.");
  if (c.statuses?.includes("asleep") && !e.sleepOnly && !called)
    return stop(
      "El usuario está dormido: este movimiento no puede usarse directamente.",
      "miss",
    );
  if (c.statuses?.includes("taunted") && move.damageClass === "status")
    return stop("Taunt impide usar movimientos de estado.");
  const fail = getMoveRequirementFailure(
    move.id,
    o.statuses ?? [],
    c.statuses ?? [],
  );
  if (fail) return stop(fail, "miss");
  if (
    e.preparation &&
    !(move.id === 76 && options.weather === "sun") &&
    !options.preparationConfirmed
  )
    return stop("Confirma que ya gastaste el turno de preparación.");
  if (e.confirmation && !options.specialConditionConfirmed)
    return stop(e.confirmation, called ? "manual" : "blocked");
  const numeric = NUMERIC_MOVE_INPUTS[move.id];
  if (
    numeric &&
    (!Number.isFinite(options.numericValue) ||
      options.numericValue! < numeric.min ||
      options.numericValue! > numeric.max ||
      (numeric.step === 1 && !Number.isInteger(options.numericValue)))
  )
    return stop(
      "Este movimiento requiere un dato adicional del tablero para calcularse; resuélvelo manualmente si fue invocado por Sleep Talk.",
      called ? "manual" : "blocked",
    );
  if (e.handler === "sleepTalk") {
    const choices = (c.moves ?? []).filter(
      (m) => m.id >= 1 && m.id <= 354 && !SLEEP_TALK_EXCLUDED.has(m.id),
    );
    if (!choices.length)
      return stop(
        "Sleep Talk falló: no hay otro movimiento aprendido elegible.",
        "miss",
      );
    const chosen = choices[Math.floor(random(0) * choices.length)];
    const result = resolveBattleMove(
      c,
      o,
      chosen,
      { ...rolls, extra: rolls.extra?.slice(1) },
      id,
      conditionsConfirmed,
      options,
      true,
    );
    return {
      ...result,
      moveId: 214,
      resolvedMoveId: chosen.id,
      moveName: `Sleep Talk → ${chosen.displayName}`,
      effectMessages: [
        `Sleep Talk seleccionó ${chosen.displayName}. Confirma sus PP disponibles en el tablero.`,
        ...(result.effectMessages ?? []),
      ],
    };
  }
  if (e.preparation && options.preparationConfirmed)
    r.effectMessages!.push(
      "El jugador confirmó el turno de preparación previo.",
    );
  if (e.confirmation && options.specialConditionConfirmed)
    r.effectMessages!.push(`Condición confirmada: ${e.confirmation}`);
  if (options.targetHasActed !== undefined)
    r.effectMessages!.push(
      `Turno declarado del objetivo: ${options.targetHasActed ? "ya actuó" : "todavía no actúa"}.`,
    );
  if (numeric)
    r.effectMessages!.push(`${numeric.label}: ${options.numericValue}.`);
  if (options.powerBoostConfirmed)
    r.effectMessages!.push(
      "Se declaró la condición para duplicar la potencia.",
    );
  if (options.weather && options.weather !== "none")
    r.effectMessages!.push(`Clima declarado: ${options.weather}.`);
  r.manualEffect = e.notes.length ? e.notes.join(" ") : null;
  if (e.automation === "manual") {
    r.outcome = "manual";
    r.message = "Uso registrado; este efecto aún requiere resolución manual.";
    r.manualEffect = e.description;
    return r;
  }
  if (
    move.id === 262 &&
    normalizeStages(o.stages).attack === -6 &&
    normalizeStages(o.stages)["special-attack"] === -6
  )
    return stop(
      "Memento falló: ambas estadísticas del objetivo ya están en −6.",
      "miss",
    );
  if (
    e.handler === "rest" &&
    (c.statuses?.includes("asleep") || getCurrentHp(p) >= getMaxHp(p)!)
  )
    return stop(
      "Rest falló: el usuario ya duerme o tiene HP completo.",
      "miss",
    );
  if (
    e.handler === "bellyDrum" &&
    (getCurrentHp(p) <= Math.floor(getMaxHp(p)! / 2) ||
      normalizeStages(p.battleStages).attack >= 6)
  )
    return stop(
      "Belly Drum falló: HP insuficiente o Attack ya está en +6.",
      "miss",
    );
  if (e.handler === "endeavor" && getCurrentHp(q) <= getCurrentHp(p))
    return stop(
      "Endeavor falló: el objetivo no tiene más HP que el usuario.",
      "miss",
    );
  if (e.handler === "ohko" && p.level > 0 && p.level < (q.level ?? 50))
    return stop(
      "El movimiento de KO falla contra un objetivo de mayor nivel.",
      "miss",
    );
  if (move.id === 73 && q.types.includes("grass"))
    return stop("Leech Seed no afecta a tipos Grass.", "immune");
  if (move.damageClass !== "status" || move.id === 86)
    r.effectiveness =
      move.id === 165 ? 1 : typeEffectiveness(move.type, q.types);
  if (r.effectiveness === 0) return stop("El objetivo es inmune.", "immune");
  r.hitChance = moveHitChance(c, o, move, options);
  r.accuracyRoll = rolls.accuracy * 100;
  const misses = r.accuracyRoll >= r.hitChance!;
  if (misses && e.handler !== "crash")
    return stop("El movimiento falló.", "miss");
  if (move.damageClass === "status") {
    r.outcome = "status";
    r.message = "El movimiento acertó.";
    return r;
  }
  let power = move.power ?? 0;
  if (
    ["pursuit", "revenge"].includes(e.handler ?? "") &&
    options.powerBoostConfirmed
  )
    power *= 2;
  const hpRatio = getCurrentHp(p) / getMaxHp(p)!;
  if (e.handler === "flail") {
    const n = Math.floor(48 * hpRatio);
    power =
      n <= 1
        ? 200
        : n <= 4
          ? 150
          : n <= 9
            ? 100
            : n <= 16
              ? 80
              : n <= 32
                ? 40
                : 20;
  }
  if (e.handler === "eruption") power = Math.max(1, Math.floor(150 * hpRatio));
  if (
    e.handler === "facade" &&
    (c.statuses ?? []).some((s) =>
      ["burned", "poisoned", "badly-poisoned", "paralyzed"].includes(s),
    )
  )
    power *= 2;
  if (e.handler === "smellingSalts" && o.statuses?.includes("paralyzed"))
    power *= 2;
  if (e.handler === "weight") {
    const w = options.numericValue!;
    power =
      w < 10
        ? 20
        : w < 25
          ? 40
          : w < 50
            ? 60
            : w < 100
              ? 80
              : w < 200
                ? 100
                : 120;
  }
  if (e.handler === "return")
    power = Math.max(1, Math.floor((options.numericValue! * 2) / 5));
  if (e.handler === "frustration")
    power = Math.max(1, Math.floor(((255 - options.numericValue!) * 2) / 5));
  if (e.handler === "furyCutter") power = 10 * 2 ** (options.numericValue! - 1);
  if (e.handler === "rollout") power = 30 * 2 ** (options.numericValue! - 1);
  if (e.handler === "spitUp") power = 100 * options.numericValue!;
  if (e.handler === "magnitude") {
    const roll = random(1);
    power =
      roll < 0.05
        ? 10
        : roll < 0.15
          ? 30
          : roll < 0.35
            ? 50
            : roll < 0.65
              ? 70
              : roll < 0.85
                ? 90
                : roll < 0.95
                  ? 110
                  : 150;
    r.effectMessages!.push(`Magnitude: potencia ${power}.`);
  }
  if (e.handler === "present") {
    const roll = random(1);
    if (roll >= 0.8) {
      r.outcome = "status";
      r.message = "Present recupera 1/4 del HP máximo del objetivo.";
      r.presentHealing = true;
      return r;
    }
    power = roll < 0.4 ? 40 : roll < 0.7 ? 80 : 120;
  }
  if (
    e.handler === "weatherBall" &&
    options.weather &&
    options.weather !== "none"
  ) {
    power = 100;
    move.type = { sun: "fire", rain: "water", hail: "ice", sand: "rock" }[
      options.weather
    ];
    move.damageClass = ["fire", "water", "ice"].includes(move.type)
      ? "special"
      : "physical";
    r.effectiveness = typeEffectiveness(move.type, q.types);
    if (!r.effectiveness)
      return stop("El objetivo es inmune al tipo de Weather Ball.", "immune");
  }
  const fixed =
    e.handler === "fixed20"
      ? 20
      : e.handler === "fixed40"
        ? 40
        : e.handler === "level"
          ? p.level
          : e.handler === "halfHp"
            ? Math.max(1, Math.floor(getCurrentHp(q) / 2))
            : e.handler === "endeavor"
              ? getCurrentHp(q) - getCurrentHp(p)
              : e.handler === "psywave"
                ? Math.max(
                    1,
                    Math.floor(
                      (p.level * (50 + Math.floor(random(1) * 101))) / 100,
                    ),
                  )
                : e.handler === "ohko"
                  ? getCurrentHp(q)
                  : ["counter", "mirrorCoat", "bide"].includes(e.handler ?? "")
                    ? 2 * options.numericValue!
                    : null;
  if (fixed !== null) {
    r.damage = fixed;
    r.outcome = "hit";
    r.message = "El movimiento acertó; daño especial sin STAB ni crítico.";
    return r;
  }
  const own = normalizeStages(p.battleStages),
    foe = normalizeStages(o.stages);
  const attackName =
    move.damageClass === "physical" ? "attack" : "special-attack";
  const defenseName =
    move.damageClass === "physical" ? "defense" : "special-defense";
  const a = p.stats.find((s) => s.name === attackName)?.value,
    d = q.stats.find((s) => s.name === defenseName)?.value;
  if (!a || !d) return stop("Estadísticas ofensivas/defensivas inválidas.");
  r.criticalChance = criticalChance(move);
  r.criticalRoll = rolls.critical;
  r.stab = p.types.includes(move.type) && move.id !== 165 ? 1.5 : 1;
  r.burn =
    move.damageClass === "physical" && c.statuses?.includes("burned") ? 0.5 : 1;
  let weather = 1;
  if (options.weather === "sun")
    weather = move.type === "fire" ? 1.5 : move.type === "water" ? 0.5 : 1;
  if (options.weather === "rain")
    weather = move.type === "water" ? 1.5 : move.type === "fire" ? 0.5 : 1;
  if (
    move.id === 76 &&
    ["rain", "hail", "sand"].includes(options.weather ?? "")
  )
    weather *= 0.5;
  r.weatherMultiplier = weather;
  const hitCount =
    typeof e.multihit === "number"
      ? e.multihit
      : Array.isArray(e.multihit)
        ? random(2) < 0.375
          ? 2
          : random(2) < 0.75
            ? 3
            : random(2) < 0.875
              ? 4
              : 5
        : 1;
  let remaining = getCurrentHp(q);
  r.hits = [];
  for (let i = 0; i < hitCount && remaining > 0; i++) {
    if (move.id === 167 && i > 0 && random(10 + i) >= r.hitChance! / 100) break;
    const critical =
      (i === 0 ? rolls.critical : random(15 + i)) < r.criticalChance;
    const attackStage = critical
        ? Math.max(0, own[attackName])
        : own[attackName],
      defenseStage = critical
        ? Math.min(0, foe[defenseName])
        : foe[defenseName];
    const attack = getEffectiveStat(a, attackStage),
      defense = e.selfDestruct
        ? Math.max(1, Math.floor(getEffectiveStat(d, defenseStage) / 2))
        : getEffectiveStat(d, defenseStage);
    const hitPower = move.id === 167 ? 10 * (i + 1) : power;
    const base =
      Math.floor(
        ((Math.floor((2 * p.level) / 5) + 2) * hitPower * attack) /
          (50 * defense),
      ) + 2;
    const damage = Math.max(
      1,
      Math.floor(
        base * r.stab * r.effectiveness * (critical ? 2 : 1) * r.burn * weather,
      ),
    );
    if (!Number.isSafeInteger(damage))
      return stop("Daño fuera del rango permitido.");
    r.hits.push({ damage, critical });
    r.damage += damage;
    remaining -= damage;
    r.critical ||= critical;
    if (i === 0) {
      r.attack = attack;
      r.defense = defense;
      r.attackStage = attackStage;
      r.defenseStage = defenseStage;
      r.baseDamage = base;
    }
  }
  r.damageType = move.type;
  if (misses) {
    r.crashDamage = Math.max(
      1,
      Math.min(Math.floor(r.damage / 2), Math.floor(getMaxHp(q)! / 2)),
    );
    r.damage = 0;
    return stop(
      "El movimiento falló; se aplica daño de caída al usuario.",
      "miss",
    );
  }
  r.outcome = "hit";
  r.message = r.critical ? "¡Golpe crítico!" : "El movimiento acertó.";
  return r;
}
