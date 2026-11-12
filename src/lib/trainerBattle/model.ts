import { nanoid } from "@reduxjs/toolkit";
import { STATUS_OPTIONS, type CapturedPokemon } from "@/types/pokemon";
import {
  calculateStats,
  getCurrentHp,
  getMaxHp,
  isLeveled,
  STAT_NAMES,
} from "@/lib/pokemonStats";
import { TIMED_STATUSES, validTurns } from "@/lib/statusTurns";
import { validHpMultiplier } from "@/lib/gameSettings";
import { trainerMoves, trainerSpecies } from "./catalog";
import type { TrainerBattleSession, TrainerSide } from "./types";

export const TRAINER_BATTLE_STORAGE_KEY = "pokemon-admin-trainer-battle:v1";
const sides: TrainerSide[] = ["a", "b"];
const primaryStatuses = new Set(
  STATUS_OPTIONS.filter((s) => s.group === "primary").map((s) => s.id),
);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;
const text = (value: unknown, max = 200): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const strings = (value: unknown) =>
  Array.isArray(value) &&
  value.length <= 1000 &&
  value.every((item) => typeof item === "string" && item.length <= 20000);

export function createTrainerBattleSession(): TrainerBattleSession {
  return {
    version: 1,
    id: nanoid(),
    phase: "setup",
    hpMultiplier: 1.3,
    teams: {
      a: { name: "Jugador A", pokemons: [], activeCaptureId: null },
      b: { name: "Líder de gimnasio", pokemons: [], activeCaptureId: null },
    },
    weather: null,
    runtime: null,
    history: [],
  };
}

function validMember(
  value: unknown,
  multiplier: number,
  network = false,
): value is CapturedPokemon {
  if (
    !isRecord(value) ||
    !text(value.captureId, 100) ||
    !isRecord(value.pokemon)
  )
    return false;
  const pokemon = value.pokemon;
  if (
    !integer(pokemon.id, 1, 386) ||
    !text(pokemon.name) ||
    !integer(pokemon.level, 1, 100) ||
    (network
      ? typeof pokemon.hpMultiplier !== "number" ||
        !validHpMultiplier(pokemon.hpMultiplier)
      : pokemon.hpMultiplier !== multiplier) ||
    pokemon.progressionVersion !== 1
  )
    return false;
  const species = trainerSpecies.find((s) => s.id === pokemon.id);
  if (
    !species ||
    !Array.isArray(pokemon.baseStats) ||
    !Array.isArray(pokemon.stats) ||
    pokemon.baseStats.length !== 6 ||
    pokemon.stats.length !== 6 ||
    !isRecord(pokemon.battleStages)
  )
    return false;
  if (
    !STAT_NAMES.every((name) => {
      const actual = (pokemon.baseStats as unknown[]).filter(
        (s) => isRecord(s) && s.name === name,
      );
      return (
        actual.length === 1 &&
        isRecord(actual[0]) &&
        (network
          ? integer(actual[0].value, 1, 10000)
          : actual[0].value ===
            species.baseStats.find((s) => s.name === name)?.value)
      );
    })
  )
    return false;
  const expected = calculateStats(
    network
      ? (pokemon.baseStats as typeof species.baseStats)
      : species.baseStats,
    pokemon.level as number,
    network ? Number(pokemon.hpMultiplier) : multiplier,
  );
  if (
    !STAT_NAMES.every((name) => {
      const actual = (pokemon.stats as unknown[]).filter(
        (s) => isRecord(s) && s.name === name,
      );
      return (
        actual.length === 1 &&
        isRecord(actual[0]) &&
        (name === "hp"
          ? integer(
              actual[0].value,
              0,
              expected.find((s) => s.name === "hp")!.value,
            )
          : network
            ? integer(actual[0].value, 1, 100000)
            : actual[0].value === expected.find((s) => s.name === name)!.value)
      );
    })
  )
    return false;
  if (
    ![
      "attack",
      "defense",
      "special-attack",
      "special-defense",
      "speed",
      "accuracy",
      "evasiveness",
    ].every((key) =>
      integer((pokemon.battleStages as Record<string, unknown>)[key], -6, 6),
    )
  )
    return false;
  if (
    !Array.isArray(pokemon.types) ||
    (network
      ? pokemon.types.length < 1 ||
        pokemon.types.length > 2 ||
        new Set(pokemon.types).size !== pokemon.types.length ||
        !pokemon.types.every((type) =>
          [
            "normal",
            "fire",
            "water",
            "electric",
            "grass",
            "ice",
            "fighting",
            "poison",
            "ground",
            "flying",
            "psychic",
            "bug",
            "rock",
            "ghost",
            "dragon",
            "dark",
            "steel",
            "fairy",
          ].includes(String(type)),
        )
      : pokemon.types.join(",") !== species.types.join(","))
  )
    return false;
  if (
    !Array.isArray(value.moves) ||
    value.moves.length > 4 ||
    !value.moves.every(
      (m) => isRecord(m) && trainerMoves.some((move) => move.id === m.id),
    ) ||
    new Set(value.moves.map((m) => m.id)).size !== value.moves.length
  )
    return false;
  if (value.trainerStatusContext !== undefined) {
    const context = value.trainerStatusContext;
    if (!isRecord(context)) return false;
    if (
      context.gender !== undefined &&
      context.gender !== "M" &&
      context.gender !== "F"
    )
      return false;
    for (const key of ["disabledMoveId", "encoredMoveId"] as const) {
      if (
        context[key] !== undefined &&
        !value.moves.some((move) => move.id === context[key])
      )
        return false;
    }
    if (context.gender && species.gender && context.gender !== species.gender)
      return false;
  }
  if (
    !Array.isArray(value.statuses) ||
    !value.statuses.every((s) =>
      STATUS_OPTIONS.some((option) => option.id === s),
    ) ||
    new Set(value.statuses).size !== value.statuses.length ||
    value.statuses.filter((s) => primaryStatuses.has(s)).length > 1
  )
    return false;
  const statuses = value.statuses;
  if (
    !isRecord(value.statusTurns) ||
    !Object.entries(value.statusTurns).every(
      ([key, turns]) =>
        (TIMED_STATUSES as readonly string[]).includes(key) &&
        statuses.includes(key) &&
        typeof turns === "number" &&
        validTurns(turns),
    )
  )
    return false;
  return true;
}

export function trainerSetupErrors(session: TrainerBattleSession): string[] {
  const errors: string[] = [];
  for (const side of sides) {
    const team = session.teams[side];
    const label = team.name.trim() || `Jugador ${side.toUpperCase()}`;
    if (!team.name.trim())
      errors.push(`Escribe el nombre del jugador ${side.toUpperCase()}.`);
    if (!team.pokemons.length || team.pokemons.length > 6)
      errors.push(`${label}: agrega entre 1 y 6 Pokémon.`);
    for (const member of team.pokemons) {
      if (
        !validMember(
          member,
          session.hpMultiplier,
          Boolean(session.networkBattleId),
        ) ||
        !isLeveled(member.pokemon) ||
        getMaxHp(member.pokemon) === undefined
      )
        errors.push(`${label}: revisa los datos de ${member.pokemon.name}.`);
      if (!member.moves?.length)
        errors.push(
          `${label}: asigna al menos un movimiento a ${member.pokemon.name}.`,
        );
      for (const [status, key, statusName] of [
        ["disabled", "disabledMoveId", "Disable"],
        ["encored", "encoredMoveId", "Encore"],
      ] as const) {
        if (
          member.statuses?.includes(status) &&
          !member.moves?.some(
            (move) => move.id === member.trainerStatusContext?.[key],
          )
        )
          errors.push(
            `${label}: elige el movimiento afectado por ${statusName} de ${member.pokemon.name}.`,
          );
      }
      if (member.statuses?.includes("infatuated")) {
        const foe = session.teams[side === "a" ? "b" : "a"];
        const source = foe.pokemons.find(
          (pokemon) => pokemon.captureId === foe.activeCaptureId,
        );
        const gender = (pokemon: typeof member | undefined) => {
          if (!pokemon) return undefined;
          const species = trainerSpecies.find(
            (entry) => entry.id === pokemon.pokemon.id,
          );
          return species?.gender ?? pokemon.trainerStatusContext?.gender;
        };
        const targetGender = gender(member),
          sourceGender = gender(source);
        if (
          !targetGender ||
          !sourceGender ||
          targetGender === "N" ||
          sourceGender === "N" ||
          targetGender === sourceGender
        )
          errors.push(
            `${label}: Atracción de ${member.pokemon.name} requiere géneros opuestos definidos con el Pokémon inicial de ${foe.name}.`,
          );
      }
    }
    const active = team.pokemons.find(
      (p) => p.captureId === team.activeCaptureId,
    );
    if (!active || getCurrentHp(active.pokemon) <= 0)
      errors.push(`${label}: elige un Pokémon inicial con HP.`);
  }
  const ids = sides.flatMap((side) =>
    session.teams[side].pokemons.map((p) => p.captureId),
  );
  if (
    session.networkBattleId
      ? sides.some(
          (side) =>
            new Set(session.teams[side].pokemons.map((p) => p.captureId))
              .size !== session.teams[side].pokemons.length,
        )
      : new Set(ids).size !== ids.length
  )
    errors.push(
      "Hay Pokémon con identificadores repetidos. Vuelve a agregarlos.",
    );
  return errors;
}

export function validTrainerBattleSession(
  value: unknown,
): value is TrainerBattleSession {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !text(value.id, 100) ||
    (value.networkBattleId !== undefined &&
      (value.networkBattleId !== value.id ||
        !text(value.networkBattleId, 100))) ||
    !["setup", "battle", "finished"].includes(String(value.phase)) ||
    typeof value.hpMultiplier !== "number" ||
    !validHpMultiplier(value.hpMultiplier) ||
    !isRecord(value.teams)
  )
    return false;
  const ids: string[] = [];
  for (const side of sides) {
    const team = value.teams[side];
    if (
      !isRecord(team) ||
      typeof team.name !== "string" ||
      team.name.length > 60 ||
      !Array.isArray(team.pokemons) ||
      team.pokemons.length > 6 ||
      !team.pokemons.every((p) =>
        validMember(
          p,
          value.hpMultiplier as number,
          Boolean(value.networkBattleId),
        ),
      )
    )
      return false;
    const memberIds = team.pokemons.map((p) => p.captureId as string);
    if (new Set(memberIds).size !== memberIds.length) return false;
    if (
      team.activeCaptureId !== null &&
      !memberIds.includes(String(team.activeCaptureId))
    )
      return false;
    ids.push(...memberIds);
  }
  if (!value.networkBattleId && new Set(ids).size !== ids.length) return false;
  if (value.networkItems !== undefined) {
    const items = value.networkItems;
    if (
      !value.networkBattleId ||
      !isRecord(items) ||
      Object.keys(items).some((key) => !["pending", "used"].includes(key)) ||
      !isRecord(items.pending) ||
      Object.keys(items.pending).some(
        (key) => !sides.includes(key as TrainerSide),
      ) ||
      !Array.isArray(items.used) ||
      items.used.length > 8192 ||
      !items.used.every((id) => text(id, 128)) ||
      new Set(items.used).size !== items.used.length
    )
      return false;
    for (const side of sides) {
      const pending = items.pending[side];
      if (pending === undefined) continue;
      const team = value.teams[side] as { pokemons: CapturedPokemon[] };
      if (
        !isRecord(pending) ||
        Object.keys(pending).some(
          (key) => !["commandId", "captureId"].includes(key),
        ) ||
        !text(pending.commandId, 128) ||
        !text(pending.captureId, 128) ||
        !team.pokemons.some(
          (capture) => capture.captureId === pending.captureId,
        )
      )
        return false;
    }
  }
  if (
    value.weather !== null &&
    (!isRecord(value.weather) ||
      !["sun", "rain", "sand", "hail"].includes(String(value.weather.kind)) ||
      !integer(value.weather.turnsLeft, 0, 100))
  )
    return false;
  if (
    !Array.isArray(value.history) ||
    value.history.length > 50 ||
    !value.history.every(
      (batch) =>
        isRecord(batch) &&
        text(batch.id) &&
        integer(batch.turn, 1, 1000000) &&
        typeof batch.completed === "boolean" &&
        strings(batch.events) &&
        strings(batch.highlights) &&
        Array.isArray(batch.results) &&
        batch.results.length <= 30 &&
        batch.results.every(
          (result) =>
            isRecord(result) &&
            text(result.id) &&
            text(result.attackerName) &&
            typeof result.moveName === "string" &&
            typeof result.message === "string" &&
            typeof result.appliedDamage === "number" &&
            Number.isFinite(result.appliedDamage) &&
            ["hit", "miss", "immune", "status", "blocked", "manual"].includes(
              String(result.outcome),
            ) &&
            (result.protocol === undefined || strings(result.protocol)),
        ),
    )
  )
    return false;
  if (value.phase === "setup") return value.runtime === null;
  const runtime = value.runtime;
  if (
    !isRecord(runtime) ||
    typeof runtime.engine !== "string" ||
    runtime.engine.length > 5000000 ||
    !integer(runtime.serial, 0, 1000000) ||
    !integer(runtime.turn, 1, 1000000) ||
    typeof runtime.ended !== "boolean" ||
    ![null, "a", "b", "draw"].includes(runtime.winner as null | string) ||
    !isRecord(runtime.pending) ||
    !isRecord(runtime.requests)
  )
    return false;
  try {
    const snapshot: unknown = JSON.parse(runtime.engine);
    if (
      !isRecord(snapshot) ||
      snapshot.formatid !== "gen3customgame" ||
      !Array.isArray(snapshot.sides) ||
      snapshot.sides.length !== 2 ||
      !snapshot.sides.every(
        (side) =>
          isRecord(side) &&
          (side.id === "p1" || side.id === "p2") &&
          Array.isArray(side.pokemon) &&
          side.pokemon.length >= 1 &&
          side.pokemon.length <= 6,
      )
    )
      return false;
  } catch {
    return false;
  }
  if (runtime.ended !== (value.phase === "finished")) return false;
  for (const side of sides) {
    const request = runtime.requests[side];
    if (
      !isRecord(request) ||
      !Array.isArray(request.moves) ||
      request.moves.length > 4 ||
      !request.moves.every(
        (m) =>
          isRecord(m) &&
          integer(m.id, 0, 354) &&
          typeof m.name === "string" &&
          integer(m.pp, 0, 100) &&
          integer(m.maxpp, 0, 100) &&
          typeof m.disabled === "boolean",
      ) ||
      !["forceSwitch", "waiting", "locked", "trapped"].every(
        (key) => typeof request[key] === "boolean",
      )
    )
      return false;
    const choice = runtime.pending[side];
    const ownTeam = value.teams[side] as { pokemons: CapturedPokemon[] };
    const ownsTarget =
      isRecord(choice) &&
      ownTeam.pokemons.some(
        (pokemon) => pokemon.captureId === choice.captureId,
      );
    if (
      choice !== undefined &&
      (!isRecord(choice) ||
        !(
          choice.kind === "wait" ||
          (choice.kind === "move" && integer(choice.moveId, 0, 354)) ||
          (choice.kind === "switch" && ownsTarget) ||
          (choice.kind === "item" &&
            choice.item === "full-restore" &&
            ownsTarget)
        ))
    )
      return false;
  }
  return true;
}

export function readTrainerBattleSession(
  storage: Pick<Storage, "getItem">,
): TrainerBattleSession | null {
  const raw = storage.getItem(TRAINER_BATTLE_STORAGE_KEY);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!validTrainerBattleSession(value))
    throw new Error(
      "La batalla guardada tiene datos incompatibles. Puedes iniciar una nueva configuración.",
    );
  return value;
}

export function writeTrainerBattleSession(
  storage: Pick<Storage, "setItem">,
  session: TrainerBattleSession,
): void {
  if (!validTrainerBattleSession(session))
    throw new Error("No se pudo guardar: revisa los datos de los equipos.");
  storage.setItem(TRAINER_BATTLE_STORAGE_KEY, JSON.stringify(session));
}
