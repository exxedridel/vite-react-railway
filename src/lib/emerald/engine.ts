/** Gen III simulator adapter. Board stats remain the source of truth.
 * The simulator snapshot is plain JSON: no instances/functions enter Redux.
 * @pkmn/sim 0.10.11 / Pokémon Showdown, MIT (see THIRD_PARTY_NOTICES.md).
 */
import { turnHighlights } from "./highlights";
import { installRollAudit } from "./audit";
import {
  Battle,
  Dex,
  toID,
  type Pokemon as SimPokemon,
  type PokemonSet,
  type Side,
} from "@pkmn/sim";
import type {
  CapturedPokemon,
  Pokemon,
  PokemonStatus,
  BattleStages,
} from "@/types/pokemon";
import type { BattleResult } from "@/types/battle";
import type { BattleOpponent } from "@/lib/battleOpponent";
import {
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
} from "@/lib/pokemonStats";
import { clearBattleConditions } from "@/lib/pokemonCondition";
import { emptyBattleField, type BattleField } from "@/lib/battleField";
import { normalizeStages } from "@/lib/battleModifiers";
import type { StatusCarrier, TimedStatus } from "@/lib/statusTurns";
import type { LearnedMove } from "@/types/moves";
import type { ConsumableItemId } from "@/lib/shop/types";
import { getCurrentMovePp, getMaxMovePp } from "@/lib/movePp";
import {
  encounterKey,
  type CombatState,
  type EmeraldChoice,
  type EmeraldRequest,
  type EmeraldUpdate,
  type BattleSide,
} from "./types";

// Shared board adaptations; trainer battles retain the simulator's native rules.
export {
  setFor as createEmeraldPokemonSet,
  applyStats as applyEmeraldStats,
  applyStages as applyEmeraldStages,
  readStages as readEmeraldStages,
  syncStatus as syncEmeraldStatus,
  readStatus as readEmeraldStatus,
  request as readEmeraldRequest,
  choose as chooseEmeraldAction,
  publicLines as emeraldPublicLines,
  describe as describeEmeraldLine,
};

const dex = Dex.forGen(3);
const FULL_RESTORE_EVENT = "wildfullrestore";
const restoredVolatiles = [
  "confusion",
  "attract",
  "taunt",
  "torment",
  "flinch",
  "partiallytrapped",
  "trapped",
  "disable",
  "encore",
  "perishsong",
  "leechseed",
  "curse",
  "nightmare",
  "yawn",
  "foresight",
] as const;

/** The existing board Full Restore rules include revival and neutral boosts. */
export function emeraldFullRestoreNeeded(target: SimPokemon): boolean {
  return (
    target.hp < target.maxhp ||
    !!target.status ||
    restoredVolatiles.some((effect) => !!target.volatiles[effect]) ||
    Object.values(target.boosts).some((stage) => stage !== 0)
  );
}

/** Applies an already selected item inside the native action queue. It never
 * advances the turn or PRNG independently, and leaves spent PP untouched. */
export function applyEmeraldFullRestore(
  battle: Battle,
  target: SimPokemon,
  trainerName: string,
  targetName: string,
): boolean {
  if (!emeraldFullRestoreNeeded(target)) return false;
  battle.add("message", `${trainerName} usó Full restore en ${targetName}.`);
  target.hp = target.maxhp;
  target.fainted = false;
  target.faintQueued = false;
  target.subFainted = false;
  const oldStatus = target.status;
  target.clearStatus();
  if (oldStatus)
    battle.add("-curestatus", target, oldStatus, "[from] item: Full restore");
  for (const effect of restoredVolatiles) {
    if (!target.volatiles[effect]) continue;
    // Their End callbacks inflict harm instead of curing the condition.
    if (effect === "perishsong" || effect === "yawn")
      delete target.volatiles[effect];
    else target.removeVolatile(effect);
  }
  applyStages(target, neutralBattleStages());
  target.side.pokemonLeft = target.side.pokemon.filter(
    (pokemon) => pokemon.hp > 0 && !pokemon.fainted,
  ).length;
  battle.add(
    "-heal",
    target,
    `${target.hp}/${target.maxhp}`,
    "[from] item: Full restore",
  );
  battle.add("-clearboost", target, "[from] item: Full restore");
  battle.add(
    "message",
    `${targetName}: estados negativos y contadores eliminados; todos los modificadores de combate restablecidos a 0.`,
  );
  battle.add("boardend");
  return true;
}
/** Learned PP remain authoritative while Transform/Mimic replace active slots. */
type OriginalPpPokemon = SimPokemon & {
  boardOriginalPp?: Record<string, SimPokemon["baseMoveSlots"][number]>;
};
function originalPpSlots(target: SimPokemon) {
  const pokemon = target as OriginalPpPokemon;
  const originals = new Set(
    target.set.moves.map((name) => dex.moves.get(name).id),
  );
  const slots = target.baseMoveSlots.filter((slot) => originals.has(slot.id));
  for (const [id, slot] of Object.entries(pokemon.boardOriginalPp ?? {}))
    if (
      originals.has(id as typeof slot.id) &&
      !slots.some((entry) => entry.id === id)
    )
      slots.push(slot);
  return slots;
}

/** Sketch can remove a slot after it has spent PP. Keep that original resource
 * separate from the copied move, which must not overwrite the learned catalog. */
export function retainEmeraldOriginalPp(
  target: SimPokemon,
  before: SimPokemon["baseMoveSlots"],
) {
  const originals = new Set(
    target.set.moves.map((name) => dex.moves.get(name).id),
  );
  for (const slot of before) {
    if (
      !originals.has(slot.id) ||
      target.baseMoveSlots.some((entry) => entry.id === slot.id)
    )
      continue;
    const pokemon = target as OriginalPpPokemon;
    pokemon.boardOriginalPp ??= {};
    pokemon.boardOriginalPp[slot.id] = { ...slot };
  }
}
export function initializeEmeraldPp(
  target: SimPokemon,
  learned: LearnedMove[] = [],
) {
  for (const slot of target.baseMoveSlots) {
    const move = learned.find(
      (entry) => dex.moves.get(slot.id).num === entry.id,
    );
    slot.maxpp = move ? getMaxMovePp(move) : dex.moves.get(slot.id).pp;
    slot.pp = move ? getCurrentMovePp(move) : slot.maxpp;
  }
}
export function readEmeraldPp(
  target: SimPokemon,
  learned: LearnedMove[] = [],
): LearnedMove[] {
  return learned.map((move) => {
    const slot = originalPpSlots(target).find(
      (entry) => dex.moves.get(entry.id).num === move.id,
    );
    return {
      ...move,
      currentPp: slot
        ? Math.min(getMaxMovePp(move), Math.max(0, slot.pp))
        : target.set.moves.some((name) => dex.moves.get(name).num === move.id)
          ? 0
          : getCurrentMovePp(move),
    };
  });
}
function ppItemSlots(
  target: SimPokemon,
  item: ConsumableItemId,
  moveId?: number,
) {
  if (item === "max-ether") {
    if (!Number.isSafeInteger(moveId)) return [];
    return originalPpSlots(target).filter(
      (slot) => dex.moves.get(slot.id).num === moveId,
    );
  }
  return item === "max-elixir" && moveId === undefined
    ? originalPpSlots(target)
    : [];
}
export function emeraldItemNeeded(
  target: SimPokemon,
  item: ConsumableItemId,
  moveId?: number,
): boolean {
  if (item === "full-restore")
    return moveId === undefined && emeraldFullRestoreNeeded(target);
  return ppItemSlots(target, item, moveId).some((slot) => slot.pp < slot.maxpp);
}
export function applyEmeraldItem(
  battle: Battle,
  target: SimPokemon,
  trainerName: string,
  targetName: string,
  item: ConsumableItemId,
  moveId?: number,
): boolean {
  if (!emeraldItemNeeded(target, item, moveId)) return false;
  if (item === "full-restore")
    return applyEmeraldFullRestore(battle, target, trainerName, targetName);
  const slots = ppItemSlots(target, item, moveId);
  for (const slot of slots) slot.pp = slot.maxpp;
  const label = item === "max-ether" ? "Max Ether" : "Max Elixir";
  battle.add(
    "message",
    `${trainerName} usó ${label} en ${targetName}${item === "max-ether" ? ` (${slots[0].move})` : ""}.`,
  );
  battle.add("boardend");
  return true;
}
const primary: Partial<Record<PokemonStatus, string>> = {
  burned: "brn",
  frozen: "frz",
  paralyzed: "par",
  asleep: "slp",
  poisoned: "psn",
  "badly-poisoned": "tox",
};
const volatile: Partial<Record<PokemonStatus, string>> = {
  confused: "confusion",
  infatuated: "attract",
  taunted: "taunt",
  tormented: "torment",
  flinched: "flinch",
  bound: "partiallytrapped",
  trapped: "trapped",
  disabled: "disable",
  encored: "encore",
  "perish-song": "perishsong",
  "leech-seed": "leechseed",
};
const statMap = {
  attack: "atk",
  defense: "def",
  "special-attack": "spa",
  "special-defense": "spd",
  speed: "spe",
  accuracy: "accuracy",
  evasiveness: "evasion",
} as const;
const weatherIds = {
  rain: "raindance",
  sun: "sunnyday",
  sand: "sandstorm",
  hail: "hail",
} as const;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** @pkmn/sim 0.10.11 dereferences moveSlots[i] while restoring every base
 * slot. Transform can copy fewer moves. Pad only the transient input so its
 * deserializer can rebuild base identities, then retain the exact active list. */
export function restoreEmeraldBattle(engine: string): Battle {
  const snapshot = JSON.parse(engine);
  const lengths = new Map<string, number>();
  for (const side of snapshot.sides ?? [])
    for (const pokemon of side.pokemon ?? []) {
      const slots = pokemon.moveSlots;
      if (
        !Array.isArray(slots) ||
        !Array.isArray(pokemon.baseMoveSlots) ||
        slots.length >= pokemon.baseMoveSlots.length
      )
        continue;
      lengths.set(`${side.id}:${pokemon.set.name}`, slots.length);
      while (slots.length < pokemon.baseMoveSlots.length)
        slots.push({ ...pokemon.baseMoveSlots[slots.length], virtual: true });
    }
  const battle = Battle.fromJSON(snapshot);
  for (const side of battle.sides)
    for (const pokemon of side.pokemon) {
      const length = lengths.get(`${side.id}:${pokemon.set.name}`);
      if (length !== undefined) pokemon.moveSlots.length = length;
    }
  return battle;
}
const species = new Map(
  dex.species
    .all()
    .filter((s) => s.num > 0 && s.num <= 386 && !s.forme)
    .map((s) => [s.num, s]),
);
export const emeraldMoves = dex.moves
  .all()
  .filter((m) => m.num >= 1 && m.num <= 354 && !m.realMove);
const moves = new Map(emeraldMoves.map((m) => [m.num, m]));
export function getEmeraldMove(id: number) {
  return moves.get(id);
}
function projection(s: CombatState) {
  return JSON.stringify([s.pokemons, s.opponent, s.battleField]);
}
function setFor(c: CapturedPokemon | BattleOpponent, name: string): PokemonSet {
  const spec = species.get(c.pokemon.id);
  if (!spec)
    throw new Error(`La especie ${c.pokemon.name} no pertenece a Gen III.`);
  return {
    name,
    species: spec.name,
    ability: "",
    item: "",
    nature: "Serious",
    level: c.pokemon.level ?? 5,
    // Board adaptation: no IV/EV, held items or abilities. Friendship starts at 255.
    happiness: 255,
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: c.moves?.length
      ? c.moves.map((m) => {
          const move = moves.get(m.id);
          if (!move) throw new Error(`Movimiento fuera de Gen III: ${m.name}`);
          return move.id;
        })
      : ["struggle"],
  } as PokemonSet;
}
function applyStats(p: SimPokemon, source: Pokemon, recalculate = true) {
  const max = getMaxHp(source);
  if (!max) throw new Error(`Faltan stats calculados: ${source.name}.`);
  Object.assign(p, { level: source.level! });
  p.set.level = source.level!;
  p.maxhp = max;
  p.baseMaxhp = max;
  p.hp = Math.min(max, Math.max(0, getCurrentHp(source)));
  p.fainted = p.hp === 0;
  if (!recalculate) return;
  for (const [key, stat] of Object.entries(statMap)) {
    if (stat === "accuracy" || stat === "evasion") continue;
    const value = source.stats.find((s) => s.name === key)?.value;
    if (!value || !Number.isSafeInteger(value))
      throw new Error(`Stat inválido: ${source.name} / ${key}.`);
    p.storedStats[stat] = value;
    p.baseStoredStats[stat] = value;
  }
  p.baseStoredStats.hp = max;
}
function applyStages(p: SimPokemon, stages?: Partial<BattleStages>) {
  const values = normalizeStages(stages);
  for (const [key, stat] of Object.entries(statMap))
    p.boosts[stat] = values[key as keyof BattleStages];
}
function readStages(p: SimPokemon): BattleStages {
  const stages = neutralBattleStages();
  for (const [key, stat] of Object.entries(statMap))
    stages[key as keyof BattleStages] = p.boosts[stat];
  return stages;
}
function syncStatus(
  p: SimPokemon,
  c: StatusCarrier,
  old: StatusCarrier | undefined,
  foe: SimPokemon,
) {
  if (!old || !eq(c.statuses, old.statuses)) {
    const status = c.statuses?.map((s) => primary[s]).find(Boolean) ?? "";
    if (p.status !== status) {
      p.clearStatus();
      if (status) p.setStatus(status, foe, undefined, true);
    }
    for (const [id, effect] of Object.entries(volatile)) {
      if (c.statuses?.includes(id as PokemonStatus)) {
        if (!p.volatiles[effect])
          p.addVolatile(
            effect,
            foe,
            dex.getActiveMove(effect === "partiallytrapped" ? "bind" : effect),
          );
      } else if (p.volatiles[effect]) p.removeVolatile(effect);
    }
  }
  for (const [id, count] of Object.entries(c.statusTurns ?? {})) {
    if (!count || old?.statusTurns?.[id as TimedStatus] === count) continue;
    if (id === "asleep" && p.status === "slp") p.statusState.time = count + 1;
    const v = p.volatiles[volatile[id as PokemonStatus] ?? ""];
    if (v) {
      if (id === "perish-song") v.time = count;
      else if (id === "confused") v.time = count + 1;
      else v.duration = count;
    }
  }
}
function readStatus(p: SimPokemon, c: StatusCarrier) {
  c.statuses = [];
  c.statusTurns = {};
  for (const [id, code] of Object.entries(primary))
    if (p.status === code) c.statuses.push(id as PokemonStatus);
  for (const [id, code] of Object.entries(volatile))
    if (p.volatiles[code]) c.statuses.push(id as PokemonStatus);
  if (p.status === "slp")
    c.statusTurns.asleep = Math.max(1, Math.min(6, p.statusState.time - 1));
  for (const id of [
    "confused",
    "taunted",
    "bound",
    "disabled",
    "encored",
    "perish-song",
  ] as const) {
    const v = p.volatiles[volatile[id]!];
    const left =
      id === "confused"
        ? v?.time - 1
        : id === "perish-song"
          ? v?.time
          : v?.duration;
    if (v && Number.isFinite(left))
      c.statusTurns[id] = Math.max(1, Math.min(6, left));
  }
}
function syncWeather(b: Battle, field: BattleField, old?: BattleField) {
  if (old && eq(field.weather, old.weather)) return;
  const w = field.weather;
  if (!w) b.field.clearWeather();
  else {
    const id = weatherIds[w.kind];
    if (b.field.weather !== id) {
      b.field.clearWeather();
      b.field.setWeather(id, b.p1.active[0]);
    }
    b.field.weatherState.duration = w.permanent ? 0 : w.turnsLeft;
  }
}
function initialise(
  state: CombatState,
  captureId: string,
  seed: [number, number, number, number],
): Battle {
  const current = state.pokemons.find((c) => c.captureId === captureId);
  if (!current || !state.opponent) throw new Error("Selecciona ambos Pokémon.");
  if (
    getCurrentHp(current.pokemon) <= 0 ||
    getCurrentHp(state.opponent.pokemon) <= 0
  )
    throw new Error("Un Pokémon debilitado no puede iniciar un turno.");
  const team = [current, ...state.pokemons.filter((c) => c !== current)];
  const b = new Battle({
    formatid: toID("gen3customgame"),
    seed: seed.join(",") as `${number},${string}`,
    p1: { name: "Tu equipo", team: team.map((c) => setFor(c, c.captureId)) },
    p2: { name: "Rival", team: [setFor(state.opponent, "opponent")] },
  });
  for (const p of b.p1.pokemon) {
    const c = team.find((c) => c.captureId === p.set.name)!;
    applyStats(p, c.pokemon);
    applyStages(p, c.pokemon.battleStages);
    syncStatus(p, c, undefined, b.p2.active[0]);
  }
  applyStats(b.p2.active[0], state.opponent.pokemon);
  applyStages(b.p2.active[0], state.opponent.stages);
  syncStatus(b.p2.active[0], state.opponent, undefined, b.p1.active[0]);
  // Persistent resources use the displayed maximum, without hidden PP Ups.
  for (const side of b.sides)
    for (const p of side.pokemon) {
      const capture =
        side.id === "p1"
          ? team.find((c) => c.captureId === p.set.name)
          : state.opponent;
      initializeEmeraldPp(p, capture?.moves);
    }
  b.p1.pokemonLeft = b.p1.pokemon.filter((p) => p.hp > 0).length;
  syncWeather(b, state.battleField ?? emptyBattleField());
  b.makeRequest("move");
  return b;
}
function synchronise(
  b: Battle,
  state: CombatState,
  mirror: string,
  fullRestores: readonly string[] = [],
) {
  const [oldTeam, oldFoe, oldField] = JSON.parse(mirror) as [
    CapturedPokemon[],
    BattleOpponent,
    BattleField,
  ];
  if (
    !eq(
      state.pokemons.map((c) => c.captureId).sort(),
      oldTeam.map((c) => c.captureId).sort(),
    )
  )
    throw new Error(
      "El equipo cambió durante el combate. Retira al rival y vuelve a seleccionarlo.",
    );
  for (const p of [...b.p1.pokemon, ...b.p2.pokemon]) {
    const isFoe = p.side.id === "p2";
    const c = isFoe
      ? state.opponent!
      : state.pokemons.find((c) => c.captureId === p.set.name)!;
    const old = isFoe
      ? oldFoe
      : oldTeam.find((c) => c.captureId === p.set.name)!;
    if (
      !eq(c.pokemon.stats, old.pokemon.stats) ||
      c.pokemon.level !== old.pokemon.level
    )
      applyStats(
        p,
        c.pokemon,
        c.pokemon.level !== old.pokemon.level ||
          !eq(
            c.pokemon.stats.filter((s) => s.name !== "hp"),
            old.pokemon.stats.filter((s) => s.name !== "hp"),
          ),
      );
    if (!isFoe && fullRestores.includes(p.set.name)) {
      // These End events apply their harm; cancelling a condition must skip them.
      delete p.volatiles.perishsong;
      delete p.volatiles.yawn;
      p.clearStatus();
      for (const effect of [
        ...Object.values(volatile),
        "curse",
        "nightmare",
        "foresight",
      ])
        p.removeVolatile(effect);
    }
    const stages = isFoe
      ? (c as BattleOpponent).stages
      : c.pokemon.battleStages;
    const oldStages = isFoe
      ? (old as BattleOpponent).stages
      : old.pokemon.battleStages;
    if (!eq(stages, oldStages)) applyStages(p, stages);
    syncStatus(p, c, old, isFoe ? b.p1.active[0] : b.p2.active[0]);
    if (!eq(c.moves, old.moves)) {
      const slots = (c.moves ?? []).map((m) => {
        const move = moves.get(m.id)!;
        const previous = p.baseMoveSlots.find((s) => s.id === move.id);
        if (previous) {
          const oldMove = old.moves?.find((entry) => entry.id === m.id);
          // Metadata corrections must not replenish legacy active engines.
          if (
            m.currentPp !== undefined &&
            (oldMove?.currentPp === undefined ||
              getCurrentMovePp(m) !== getCurrentMovePp(oldMove))
          )
            previous.pp = getCurrentMovePp(m);
          previous.maxpp = getMaxMovePp(m);
          previous.pp = Math.min(previous.pp, previous.maxpp);
          return previous;
        }
        return {
          move: move.name,
          id: move.id,
          pp: getCurrentMovePp(m),
          maxpp: getMaxMovePp(m),
          target: move.target,
          disabled: false,
          used: false,
        };
      });
      if (!p.transformed) p.moveSlots = slots;
      Object.assign(p, { baseMoveSlots: slots });
    }
  }
  syncWeather(b, state.battleField ?? emptyBattleField(), oldField);
  if (fullRestores.length) {
    // makeRequest reads cached restrictions. Re-evaluate them without nextTurn,
    // retaining effects that still apply (for example the opponent's Imprison).
    for (const p of b.getAllActive()) {
      if (p.side.id !== "p1" || !fullRestores.includes(p.set.name)) continue;
      p.maybeDisabled = false;
      p.maybeLocked = false;
      for (const slot of p.moveSlots) {
        slot.disabled = false;
        slot.disabledSource = "";
      }
      b.runEvent("DisableMove", p);
      for (const slot of p.moveSlots)
        b.singleEvent("DisableMove", b.dex.getActiveMove(slot.id), null, p);
      p.trapped = p.maybeTrapped = false;
      b.runEvent("TrapPokemon", p);
      if (!p.knownType || b.dex.getImmunity("trapped", p))
        b.runEvent("MaybeTrapPokemon", p);
    }
  }
  b.p1.pokemonLeft = b.p1.pokemon.filter((p) => p.hp > 0).length;
  b.p2.pokemonLeft = b.p2.pokemon.filter((p) => p.hp > 0).length;
  // Refresh legal choices following manual status/stage/HP edits, but never discard a mid-turn switch request.
  if (b.requestState === "move") b.makeRequest();
}
/** Apply board corrections without choosing an action, consuming PP or advancing the PRNG. */
export function refreshEmeraldState(
  input: CombatState,
  fullRestores: readonly string[] = [],
): CombatState {
  const state = clone(input);
  const runtime = state.emerald;
  if (!runtime || runtime.encounterKey !== encounterKey(state)) return state;
  const b = restoreEmeraldBattle(runtime.engine);
  synchronise(b, state, runtime.mirror, fullRestores);
  runtime.engine = JSON.stringify(b.toJSON());
  runtime.mirror = projection(state);
  runtime.requests = { player: request(b.p1), opponent: request(b.p2) };
  runtime.serial += 1;
  return state;
}
function request(side: Side): EmeraldRequest {
  const req = side.activeRequest;
  const active = req && "active" in req ? req.active?.[0] : undefined;
  const p = side.active[0];
  return {
    moves: (active?.moves ?? []).map((m) => ({
      id: dex.moves.get(m.id).num,
      name: m.move,
      pp: m.pp ?? 0,
      maxpp: m.maxpp ?? 0,
      disabled: !!m.disabled,
    })),
    forceSwitch: !!(req && "forceSwitch" in req && req.forceSwitch?.[0]),
    waiting: !req || !!("wait" in req && req.wait),
    locked: !!(
      p.volatiles.twoturnmove ||
      p.volatiles.mustrecharge ||
      p.volatiles.lockedmove ||
      p.volatiles.bide ||
      p.volatiles.rollout ||
      p.volatiles.iceball
    ),
    trapped: !!active?.trapped,
    gender: p.gender || "—",
    semiInvulnerable: (["dig", "fly", "dive", "bounce"] as const).find(
      (phase) => !!p.volatiles[phase],
    ),
  };
}
function choose(b: Battle, side: Side, choice: EmeraldChoice) {
  if (choice.kind === "item") {
    const current = request(side);
    if (b.requestState !== "move" || current.waiting || current.forceSwitch)
      throw new Error(
        "Elige el reemplazo obligatorio antes de usar un objeto.",
      );
    if (current.locked)
      throw new Error(
        "Debes completar el movimiento forzado o la recarga antes de usar un objeto.",
      );
    const target = side.pokemon.find(
      (pokemon) => pokemon.set.name === choice.captureId,
    );
    if (!target)
      throw new Error(
        "El objeto solo puede usarse en un Pokémon de tu equipo.",
      );
    if (!emeraldItemNeeded(target, choice.item, choice.moveId))
      throw new Error(
        choice.item === "full-restore"
          ? "Este Pokémon no necesita Full Restore."
          : "El objeto no tendría efecto en el Pokémon o movimiento elegido.",
      );
    side.clearChoice();
    side.choice.actions.push({
      choice: "event",
      event: FULL_RESTORE_EVENT,
      pokemon: side.active[0],
      order: 102,
      priority: 8,
    } as unknown as (typeof side.choice.actions)[number]);
    return;
  }
  if (choice.kind === "wait") {
    if (request(side).locked)
      throw new Error("Debes completar el movimiento forzado o la recarga.");
    if (b.requestState !== "move")
      throw new Error("Debes escoger un reemplazo antes de continuar.");
    // Physical-board action (item, capture attempt, externally resolved trainer action).
    side.clearChoice();
    side.choice.actions.push({ choice: "pass" });
    return;
  }
  let command: string;
  if (choice.kind === "switch") {
    const idx = side.pokemon.findIndex((p) => p.set.name === choice.captureId);
    if (idx < 0) throw new Error("Reemplazo no disponible.");
    command = `switch ${idx + 1}`;
  } else {
    const options = request(side).moves;
    const selected = options.find((m) => m.id === choice.moveId);
    if (!selected || selected.disabled)
      throw new Error(
        "Este movimiento no está disponible: comprueba PP, Disable, Encore o Taunt.",
      );
    command = `move ${options.indexOf(selected) + 1}`;
  }
  if (!side.choose(command))
    throw new Error(side.choice.error || "Acción no permitida.");
}
function exportState(
  b: Battle,
  state: CombatState,
  oldTurn: number,
  simTurnBefore: number,
) {
  for (const side of b.sides)
    for (const p of side.pokemon) {
      const c =
        side.id === "p1"
          ? state.pokemons.find((c) => c.captureId === p.set.name)
          : state.opponent;
      if (!c) continue;
      const hp = c.pokemon.stats.find((s) => s.name === "hp");
      if (hp) hp.value = p.hp;
      if (c.moves) c.moves = readEmeraldPp(p, c.moves);
      readStatus(p, c);
      if (side.id === "p1") c.pokemon.battleStages = readStages(p);
      else (c as BattleOpponent).stages = readStages(p);
    }
  const field = state.battleField ?? (state.battleField = emptyBattleField());
  field.activeCaptureId = b.p1.active[0].set.name;
  field.playerSwitchedThisTurn = false;
  field.turn = oldTurn + Math.max(0, b.turn - simTurnBefore);
  const kind = Object.entries(weatherIds).find(
    ([, id]) => id === b.field.weather,
  )?.[0] as keyof typeof weatherIds | undefined;
  field.weather = kind
    ? {
        kind,
        turnsLeft: b.field.weatherState.duration || 5,
        ...(!b.field.weatherState.duration ? { permanent: true } : {}),
      }
    : null;
  for (const [key, effect] of [
    ["mudSport", "mudsport"],
    ["waterSport", "watersport"],
  ] as const) {
    field[key] = [];
    if (b.p1.active[0].volatiles[effect])
      field[key]!.push({ side: "player", captureId: field.activeCaptureId! });
    if (b.p2.active[0].volatiles[effect])
      field[key]!.push({ side: "opponent" });
    if (!field[key]!.length) field[key] = null;
  }
}
function publicLines(lines: string[]) {
  // Split messages contain private exact HP followed by public HP. Keep only the exact line once.
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("|split|")) {
      out.push(lines[i + 1]);
      i += 2;
    } else out.push(lines[i]);
  }
  return out;
}
function describe(line: string, names: Record<string, string>): string | null {
  const a = line.split("|");
  const who = (s = "") =>
    s.replace(/p[12][a-z]?: ([^|]+)/g, (_, id) => names[id] ?? id);
  switch (a[1]) {
    case "boardchance":
      return `Probabilidad de ${a[2]}: ${Number(((Number(a[3]) / Number(a[4])) * 100).toFixed(2))}%. Tirada: ${Number(((Number(a[5]) / Number(a[4])) * 100).toFixed(2))}% · ${a[6]} (un resultado favorable puede ser impedido por inmunidad/protección).`;
    case "move":
      return `${who(a[2])}: ${a[3]}${a.includes("[still]") ? " (preparación)" : ""}.`;
    case "boardfuture":
      return `${who(a[2])}: impacto diferido de ${a[3]} sobre ${who(a[4])}.`;
    case "-damage":
    case "-heal":
      return `${who(a[2])}: HP ${a[3]}${a[4] ? ` · ${who(a.slice(4).join(" · "))}` : ""}.`;
    case "cant":
      return `${who(a[2])} no pudo actuar: ${a.slice(3).join(" · ")}.`;
    case "-fail":
      return `Falló: ${who(a[2])}${a[3] ? ` · ${a[3]}` : ""}.`;
    case "-miss":
      return `${who(a[2])}: el movimiento falló.`;
    case "-immune":
      return `${who(a[2])}: sin efecto / inmune.`;
    case "-crit":
      return `${who(a[2])}: A critical hit!`;
    case "-supereffective":
      return `${who(a[2])}: It's super effective!`;
    case "-resisted":
      return `${who(a[2])}: It's not very effective.`;
    case "faint":
      return `${who(a[2])}: Fainted.`;
    case "switch":
    case "drag":
      return `Entra ${who(a[2])}.`;
    case "-prepare":
      return `${who(a[2])} prepara ${a[3]}; la continuación queda forzada para el siguiente turno.${a[3] === "Dig" ? " Está bajo tierra: evita ataques normales; Earthquake y Magnitude pueden alcanzarlo con daño ×2." : a[3] === "Fly" || a[3] === "Bounce" ? " Está en el aire: evita ataques normales; Gust y Twister pueden alcanzarlo con daño ×2; Thunder y Sky Uppercut también pueden alcanzarlo." : ""}`;
    case "-mustrecharge":
      return `${who(a[2])} debe recargar el siguiente turno.`;
    case "-status":
    case "-curestatus":
    case "-start":
    case "-end":
    case "-activate":
    case "-singleturn":
    case "-singlemove":
    case "-boost":
    case "-unboost":
    case "-setboost":
    case "-sidestart":
    case "-sideend":
    case "-weather":
    case "-fieldstart":
    case "-fieldend":
    case "-hitcount":
    case "-item":
    case "-enditem":
    case "-transform":
      return `${a[1].slice(1)} · ${a.slice(2).map(who).join(" · ")}`;
    case "win":
      return `Combate terminado: ${a[2]}.`;
    case "tie":
      return "Combate terminado: empate.";
    case "message":
    case "-message":
    case "hint":
      return a.slice(2).join(" ");
    default:
      return null;
  }
}
function resultsFrom(
  lines: string[],
  before: CombatState,
  b: Battle,
  id: string,
): BattleResult[] {
  const output: BattleResult[] = [];
  let current: BattleResult | undefined;
  const hp = new Map<string, number>();
  for (const c of before.pokemons) hp.set(c.captureId, getCurrentHp(c.pokemon));
  hp.set("opponent", getCurrentHp(before.opponent!.pokemon));
  const names = Object.fromEntries(
    before.pokemons.map((c) => [c.captureId, c.pokemon.name]),
  );
  names.opponent = before.opponent!.pokemon.name;
  let activePlayer =
    before.battleField?.activeCaptureId ?? before.pokemons[0].captureId;
  const key = (text: string) => text?.replace(/^p[12][a-z]?: /, "");
  for (const line of lines) {
    const a = line.split("|");
    if (["switch", "drag"].includes(a[1]) && a[2]?.startsWith("p1"))
      activePlayer = key(a[2]);
    if (a[1] === "move" || a[1] === "boardfuture" || a[1] === "cant") {
      if (
        a[1] === "move" &&
        a.some((v) => v.startsWith("[from] move:")) &&
        current
      ) {
        current.effectMessages!.push(`Movimiento invocado: ${a[3]}.`);
        continue;
      }
      const side: BattleSide = a[2].startsWith("p1") ? "player" : "opponent";
      const attacker = key(a[2]),
        defender = side === "player" ? "opponent" : activePlayer;
      const move = a[1] !== "cant" ? dex.moves.get(a[3]) : undefined;
      current = {
        id: `${id}:${output.length}`,
        captureId: side === "player" ? attacker : activePlayer,
        actorSide: side,
        attackerName: names[attacker] ?? attacker,
        opponentName: names[defender] ?? defender,
        moveId: move?.num ?? 0,
        moveName: move?.name ?? "Acción impedida",
        outcome: a[1] === "cant" ? "blocked" : "status",
        message:
          a[1] === "cant"
            ? `No pudo actuar: ${a[3]}`
            : a[1] === "boardfuture"
              ? "Impacto del ataque diferido."
              : a.includes("[still]")
                ? "Preparando movimiento"
                : "Movimiento ejecutado",
        hitChance: null,
        accuracyRoll: null,
        criticalChance: 0,
        criticalRoll: null,
        critical: false,
        damage: 0,
        appliedDamage: 0,
        wildHpBefore: null,
        wildHpAfter: null,
        level:
          side === "player"
            ? (before.pokemons.find((c) => c.captureId === attacker)?.pokemon
                .level ?? 5)
            : (before.opponent!.pokemon.level ?? 5),
        attack: null,
        defense: null,
        attackStage: null,
        defenseStage: null,
        baseDamage: null,
        stab: 1,
        effectiveness: 1,
        burn: 1,
        manualEffect: null,
        effectMessages: [],
        hpChanges: [],
        engine: "emerald",
        protocol: [],
      };
      output.push(current);
    }
    if (
      a[1] === "boardend" ||
      a[1] === "upkeep" ||
      a[1] === "turn" ||
      a[1] === "win"
    )
      current = undefined;
    if (a[1] === "-damage" || a[1] === "-heal") {
      const target = key(a[2]),
        old = hp.get(target) ?? 0,
        next = parseInt(a[3], 10);
      hp.set(target, next);
      if (current) {
        const attacker =
          current.actorSide === "player" ? current.captureId : "opponent";
        const role = target === attacker ? "attacker" : "target";
        const existing = current.hpChanges!.find(
          (c) => c.role === role && c.name === names[target],
        );
        if (existing) existing.after = next;
        else
          current.hpChanges!.push({
            role,
            name: names[target] ?? target,
            before: old,
            after: next,
          });
        if (
          a[1] === "-damage" &&
          role === "target" &&
          !a.some((v) => v.startsWith("[from]"))
        ) {
          current.damage += Math.max(0, old - next);
          current.appliedDamage = current.damage;
          current.outcome = "hit";
        }
      }
    }
    if (current) {
      current.protocol!.push(line);
      if (a[1] === "-crit") current.critical = true;
      if (a[1] === "-immune") current.outcome = "immune";
      if (a[1] === "-fail" || a[1] === "-miss") {
        current.outcome = "miss";
        current.message = "El movimiento falló.";
      }
      const description = describe(line, names);
      if (description) current.effectMessages!.push(description);
    }
  }
  return output;
}
export function runEmeraldAction(
  input: CombatState,
  captureId: string,
  side: BattleSide,
  choice: EmeraldChoice,
  seed: [number, number, number, number],
  id: string,
): EmeraldUpdate {
  const state = clone(input);
  if (state.opponent?.kind !== "wild")
    throw new Error(
      "La automatización solo está disponible para encuentros salvajes.",
    );
  if (choice.kind === "item" && side !== "player")
    throw new Error("El rival salvaje no puede usar objetos de tu mochila.");
  const existing =
    state.emerald?.version === 1 &&
    state.emerald.encounterKey === encounterKey(state)
      ? state.emerald
      : undefined;
  const b = existing
    ? restoreEmeraldBattle(existing.engine)
    : initialise(state, captureId, seed);
  // Simulator display nicknames are truncated to 20 chars by default. Capture IDs
  // are 21 chars: keep the full ID so logs and duplicate species map correctly.
  for (const team of b.sides)
    for (const p of team.pokemon)
      Object.assign(p, {
        name: p.set.name,
        fullname: `${team.id}: ${p.set.name}`,
      });
  if (b.ended)
    throw new Error(
      "Este combate terminó. Captura o retira al rival para iniciar otro.",
    );
  if (existing) synchronise(b, state, existing.mirror);
  const active = b.p1.active[0].set.name;
  if (captureId !== active && choice.kind !== "switch")
    throw new Error("Abre el combate del Pokémon que está en el campo.");
  const pending = clone(existing?.pending ?? {});
  if (pending[side])
    throw new Error(
      "Este lado ya eligió su acción. Cancélala antes de elegir otra.",
    );
  const before = clone(state);
  before.battleField ??= emptyBattleField();
  before.battleField.activeCaptureId = active;
  const start = b.log.length,
    turn = b.turn,
    oldTurn = state.battleField?.turn ?? 1;
  const simSide = side === "player" ? b.p1 : b.p2;
  if (request(simSide).waiting)
    throw new Error("Este lado debe esperar el reemplazo rival.");
  choose(b, simSide, choice);
  pending[side] = choice;
  // A forced second turn/recharge contains no new choice; register it automatically.
  for (const [s, player] of [
    ["player", b.p1],
    ["opponent", b.p2],
  ] as const) {
    const r = request(player);
    if (
      !pending[s] &&
      r.locked &&
      !r.forceSwitch &&
      r.moves.length === 1 &&
      !r.moves[0].disabled
    ) {
      const forced: EmeraldChoice = { kind: "move", moveId: r.moves[0].id };
      choose(b, player, forced);
      pending[s] = forced;
    }
  }
  let escaped = false;
  if (b.allChoicesDone()) {
    // Showdown models trainer battles. Adapt the three escape moves for a wild
    // single encounter; all accuracy, action-blocking and PP still run natively.
    const getMove = b.dex.getActiveMove;
    b.dex.getActiveMove = function (input) {
      const move = getMove.call(this, input);
      if (move.num === 100) {
        move.onTry = function (user) {
          return !(
            user.trapped ||
            user.volatiles.trapped ||
            user.volatiles.partiallytrapped ||
            user.volatiles.ingrain
          );
        };
        move.onHit = function () {
          escaped = true;
          this.add("message", "Teleport terminó el encuentro salvaje.");
          this.win();
        };
      } else if (move.num === 18 || move.num === 46) {
        move.forceSwitch = false;
        move.onHit = function (target, source) {
          if (target.volatiles.ingrain) return false;
          if (
            source.level < target.level &&
            Math.floor(
              (this.random(256) * (target.level + source.level)) / 256,
            ) +
              1 <=
              Math.floor(target.level / 4)
          )
            return false;
          escaped = true;
          this.add("message", `${move.name} terminó el encuentro salvaje.`);
          this.win();
        };
      }
      return move;
    };
    const run = b.runAction;
    b.runAction = function (action) {
      if (action.choice === "event" && action.event === FULL_RESTORE_EVENT) {
        const itemChoice = pending.player;
        if (itemChoice?.kind !== "item")
          throw new Error("El objeto pendiente ya no es válido.");
        const target = this.p1.pokemon.find(
          (pokemon) => pokemon.set.name === itemChoice.captureId,
        );
        const entry = state.pokemons.find(
          (capture) => capture.captureId === itemChoice.captureId,
        );
        if (!target || !entry)
          throw new Error("El objetivo del objeto ya no pertenece al equipo.");
        applyEmeraldItem(
          this,
          target,
          "Tu equipo",
          entry.pokemon.name,
          itemChoice.item,
          itemChoice.moveId,
        );
      }
      const originalSlots =
        action.choice === "move"
          ? action.pokemon.baseMoveSlots.slice()
          : undefined;
      const value = run.call(this, action);
      if (originalSlots && action.choice === "move")
        retainEmeraldOriginalPp(action.pokemon, originalSlots);
      if (action.choice === "move") this.add("boardend");
      return value;
    };
    const uninstallAudit = installRollAudit(b);
    try {
      b.commitChoices();
    } finally {
      uninstallAudit();
      Reflect.deleteProperty(b, "runAction");
      Reflect.deleteProperty(b.dex, "getActiveMove");
    }
    delete pending.player;
    delete pending.opponent;
  }
  const raw = publicLines(b.log.slice(start));
  exportState(b, state, oldTurn, turn);
  const results = resultsFrom(raw, before, b, id);
  const names = Object.fromEntries(
    state.pokemons.map((c) => [c.captureId, c.pokemon.name]),
  );
  names.opponent = state.opponent.pokemon.name;
  const events = raw
    .map((line) => describe(line, names))
    .filter((s): s is string => !!s);
  if (!raw.length)
    events.push(
      `${side === "player" ? "Tu Pokémon" : "Rival"}: acción elegida; esperando al otro lado.`,
    );
  const requests = { player: request(b.p1), opponent: request(b.p2) };
  // Bound persistence size while retaining all actual battle state, PP, PRNG and move history.
  b.log.length = 0;
  b.inputLog.length = 0;
  b.messageLog.length = 0;
  b.sentLogPos = 0;
  b.lastMoveLine = -1;
  const runtime = {
    version: 1 as const,
    encounterKey: encounterKey(state),
    engine: JSON.stringify(b.toJSON()),
    mirror: projection(state),
    pending,
    requests,
    ended: b.ended,
    events,
    serial: (existing?.serial ?? 0) + 1,
  };
  state.emerald = runtime;
  if (escaped) {
    for (const member of state.pokemons) clearBattleConditions(member);
    state.opponent = null;
    state.emerald = undefined;
    state.battleField = emptyBattleField();
    const tie = events.indexOf("Combate terminado: empate.");
    if (tie >= 0) events.splice(tie, 1);
    events.push("El encuentro terminó por huida; no se obtuvo una captura.");
    events.push(
      "Estados secundarios y modificadores de combate de todo el equipo limpiados.",
    );
  }
  const initialHp = Object.fromEntries(
    before.pokemons.map((c) => [c.captureId, getCurrentHp(c.pokemon)]),
  );
  initialHp.opponent = getCurrentHp(before.opponent!.pokemon);
  const highlights = turnHighlights(
    raw.filter((line) => !escaped || line !== "|tie"),
    names,
    initialHp,
  );
  return {
    ...state,
    results,
    events,
    highlights,
    completed: b.turn > turn || b.ended,
  };
}
export function cancelEmeraldChoice(
  input: CombatState,
  side: BattleSide,
): CombatState {
  const state = clone(input);
  const runtime = state.emerald;
  if (!runtime?.pending[side]) return state;
  if (runtime.pending[side]?.kind === "item")
    throw new Error(
      "El uso del objeto ya fue confirmado y no se puede cancelar.",
    );
  const b = restoreEmeraldBattle(runtime.engine);
  b.undoChoice(side === "player" ? "p1" : "p2");
  const player = side === "player" ? b.p1 : b.p2;
  if (player.choice.actions.length)
    throw new Error("Esta acción ya no se puede cancelar.");
  delete runtime.pending[side];
  runtime.engine = JSON.stringify(b.toJSON());
  runtime.serial++;
  return state;
}
