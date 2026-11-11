import { nanoid } from "@reduxjs/toolkit";
import type { PartyState } from "@/slices/partySlice";
import { transactPvpParty, store } from "@/store/store";
import {
  getActiveAccountId,
  pvpPartyRevision,
  setPvpSyncBlocked,
  isPvpSyncBlocked,
} from "@/store/accountStorage";
import { GAME_DATA_VERSION, isGenerationThreeMove } from "@/lib/gameVersion";
import {
  getCurrentHp,
  getMaxHp,
  isLeveled,
  validBaseStats,
  neutralBattleStages,
} from "@/lib/pokemonStats";
import {
  STATUS_OPTIONS,
  type CapturedPokemon,
  type PokemonStatus,
} from "@/types/pokemon";
import { TIMED_STATUSES, validTurns } from "@/lib/statusTurns";
import {
  stablePvpJson,
  type PvpSnapshot,
  type PvpResult,
} from "@/lib/pvp/types";

export { setPvpSyncBlocked, isPvpSyncBlocked };

export type PvpPartyReceipt = {
  battleId: string;
  resultId: string;
  userId: number;
  snapshotId: string;
  baseHash: string;
  resultDigest: string;
  savedAt: string;
};
export type PvpPartyLock = {
  version: 1;
  battleId: string;
  userId: number;
  clientId: string;
  phase: "held" | "reserved" | "saved";
  snapshot?: PvpSnapshot;
  resultId?: string;
  resultDigest?: string;
  conflict?: string;
  lockedAt: string;
  savedAt?: string;
};
export type PvpReservation = {
  battleId: string;
  userId: number;
  clientId: string;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const primaryStatuses = new Set<PokemonStatus>(
  STATUS_OPTIONS.filter((s) => s.group === "primary").map((s) => s.id),
);
const allStatuses = new Set<string>(STATUS_OPTIONS.map((s) => s.id));
const textId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function getPvpLock(
  party: Pick<PartyState, "pvpLock">,
): PvpPartyLock | null {
  return party.pvpLock ?? null;
}

export async function hashPvpPokemons(
  pokemons: CapturedPokemon[],
): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "PvP necesita una conexión segura para verificar la instantánea del equipo.",
    );
  const bytes = new TextEncoder().encode(stablePvpJson(pokemons));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function digestResult(result: PvpResult): Promise<string> {
  const bytes = new TextEncoder().encode(stablePvpJson(result));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function activeUserId(): number {
  const id = getActiveAccountId();
  if (id === null)
    throw new Error(
      "Inicia sesión en la cuenta propietaria para recuperar la batalla PvP.",
    );
  return id;
}

function validateReservation(input: PvpReservation): void {
  if (
    !textId(input.battleId) ||
    !textId(input.clientId) ||
    !Number.isSafeInteger(input.userId) ||
    input.userId <= 0
  )
    throw new Error("La reserva PvP no es válida.");
}

function validateConditions(capture: CapturedPokemon): void {
  const statuses = capture.statuses ?? [];
  if (
    !Array.isArray(statuses) ||
    statuses.some((status) => !allStatuses.has(status)) ||
    new Set(statuses).size !== statuses.length ||
    statuses.filter((status) => primaryStatuses.has(status)).length > 1
  )
    throw new Error(
      `${capture.pokemon.name}: revisa los estados antes de ingresar a PvP.`,
    );
  const turns = capture.statusTurns ?? {};
  if (
    !record(turns) ||
    Object.entries(turns).some(
      ([status, count]) =>
        !(TIMED_STATUSES as readonly string[]).includes(status) ||
        !statuses.includes(status as PokemonStatus) ||
        !validTurns(count),
    )
  )
    throw new Error(
      `${capture.pokemon.name}: los contadores de estado no son válidos.`,
    );
}

function validatePokemons(pokemons: CapturedPokemon[]): void {
  if (!Array.isArray(pokemons) || pokemons.length < 1 || pokemons.length > 6)
    throw new Error("PvP requiere un equipo de entre 1 y 6 Pokémon.");
  const ids = new Set<string>();
  for (const capture of pokemons) {
    const pokemon = capture?.pokemon;
    if (
      !textId(capture?.captureId) ||
      ids.has(capture.captureId) ||
      !pokemon ||
      !Number.isSafeInteger(pokemon.id) ||
      pokemon.id < 1 ||
      pokemon.id > 386 ||
      !isLeveled(pokemon) ||
      !Number.isSafeInteger(pokemon.level) ||
      pokemon.level < 1 ||
      pokemon.level > 100 ||
      !validBaseStats(pokemon.baseStats) ||
      !Array.isArray(pokemon.stats) ||
      !Array.isArray(pokemon.types) ||
      !pokemon.types.length
    )
      throw new Error(
        "El equipo necesita Pokémon válidos de generación III con nivel de 1 a 100.",
      );
    ids.add(capture.captureId);
    const maxHp = getMaxHp(pokemon);
    if (
      !maxHp ||
      !Number.isSafeInteger(getCurrentHp(pokemon)) ||
      getCurrentHp(pokemon) < 0 ||
      getCurrentHp(pokemon) > maxHp
    )
      throw new Error(`${pokemon.name}: el HP actual no es válido.`);
    if (
      !Array.isArray(capture.moves) ||
      capture.moves.length < 1 ||
      capture.moves.length > 4 ||
      capture.moves.some((move) => !isGenerationThreeMove(move.id)) ||
      new Set(capture.moves.map((move) => move.id)).size !==
        capture.moves.length
    )
      throw new Error(
        `${pokemon.name}: elige de 1 a 4 movimientos de generación III antes de ingresar.`,
      );
    validateConditions(capture);
  }
  if (!pokemons.some((capture) => getCurrentHp(capture.pokemon) > 0))
    throw new Error(
      "Necesitas al menos un Pokémon con HP para ingresar a PvP.",
    );
}

function checkBattle(lock: PvpPartyLock | null, input: PvpReservation): void {
  if (
    lock &&
    (lock.battleId !== input.battleId ||
      lock.userId !== input.userId ||
      lock.clientId !== input.clientId)
  )
    throw new Error(
      "Esta partida ya está reservada por otra batalla o dispositivo. Recupera la sesión original.",
    );
}

function changed(party: PartyState, fields: Partial<PartyState>): PartyState {
  return { ...party, ...fields, pvpRevision: pvpPartyRevision(party) + 1 };
}

function heldLock(input: PvpReservation): PvpPartyLock {
  return {
    version: 1,
    ...input,
    phase: "held",
    lockedAt: new Date().toISOString(),
  };
}

export function holdPvpParty(input: PvpReservation): Promise<void> {
  validateReservation(input);
  return transactPvpParty(input.userId, async (party) => {
    const lock = getPvpLock(party);
    checkBattle(lock, input);
    return {
      party: lock ? party : changed(party, { pvpLock: heldLock(input) }),
      value: undefined,
    };
  });
}

export function reservePvpParty(input: PvpReservation): Promise<PvpSnapshot> {
  validateReservation(input);
  return transactPvpParty(input.userId, async (party) => {
    const lock = getPvpLock(party);
    checkBattle(lock, input);
    if (lock?.snapshot) {
      if (lock.conflict) throw new Error(lock.conflict);
      return { party, value: clone(lock.snapshot) };
    }
    if (
      (party.opponent && getCurrentHp(party.opponent.pokemon) > 0) ||
      (party.emerald && !party.emerald.ended)
    )
      throw new Error("Termina el encuentro local antes de ingresar a PvP.");
    if (party.dataVersion !== GAME_DATA_VERSION)
      throw new Error(
        "La partida necesita una versión compatible antes de ingresar a PvP.",
      );
    validatePokemons(party.pokemons);
    const pokemons = clone(party.pokemons);
    const active =
      pokemons.find(
        (capture) =>
          capture.captureId === party.battleField?.activeCaptureId &&
          getCurrentHp(capture.pokemon) > 0,
      ) ?? pokemons.find((capture) => getCurrentHp(capture.pokemon) > 0)!;
    const snapshot: PvpSnapshot = {
      version: 1,
      ...input,
      snapshotId: globalThis.crypto?.randomUUID?.() ?? nanoid(),
      dataVersion: party.dataVersion,
      baseHash: await hashPvpPokemons(pokemons),
      pokemons,
      activeCaptureId: active.captureId,
      hpMultiplier: active.pokemon.hpMultiplier ?? 1.3,
    };
    return {
      party: changed(party, {
        pvpLock: { ...(lock ?? heldLock(input)), phase: "reserved", snapshot },
      }),
      value: clone(snapshot),
    };
  });
}

function validateSnapshot(snapshot: PvpSnapshot): void {
  validateReservation(snapshot);
  if (
    snapshot.version !== 1 ||
    !textId(snapshot.snapshotId) ||
    typeof snapshot.baseHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(snapshot.baseHash) ||
    !Array.isArray(snapshot.pokemons) ||
    !textId(snapshot.activeCaptureId)
  )
    throw new Error("La instantánea PvP recibida no es válida.");
  validatePokemons(snapshot.pokemons);
  if (
    !snapshot.pokemons.some(
      (capture) => capture.captureId === snapshot.activeCaptureId,
    )
  )
    throw new Error("La instantánea PvP no contiene el Pokémon activo.");
}

/** A foreign/different local team remains blocked; recovery never imports the server team. */
export async function recoverPvpPartyLock(
  snapshot: PvpSnapshot,
): Promise<void> {
  validateSnapshot(snapshot);
  const problem = await transactPvpParty(snapshot.userId, async (party) => {
    const input: PvpReservation = {
      battleId: snapshot.battleId,
      userId: snapshot.userId,
      clientId: snapshot.clientId,
    };
    const previous = getPvpLock(party);
    checkBattle(previous, input);
    const receipt = party.pvpReceipts?.find(
      (item) =>
        item.battleId === snapshot.battleId &&
        item.snapshotId === snapshot.snapshotId &&
        item.baseHash === snapshot.baseHash,
    );
    const validHash =
      (await hashPvpPokemons(snapshot.pokemons)) === snapshot.baseHash;
    const matches =
      validHash &&
      (receipt ||
        (await hashPvpPokemons(party.pokemons)) === snapshot.baseHash);
    const conflict = matches
      ? undefined
      : "El equipo de este dispositivo no coincide con el equipo reservado. Usa el dispositivo original; la partida permanece bloqueada.";
    const nextLock: PvpPartyLock = {
      ...(previous ?? heldLock(input)),
      snapshot: clone(snapshot),
      phase: receipt ? "saved" : matches ? "reserved" : "held",
      conflict,
      ...(receipt
        ? {
            resultId: receipt.resultId,
            resultDigest: receipt.resultDigest,
            savedAt: receipt.savedAt,
          }
        : {}),
    };
    const same =
      previous && stablePvpJson(previous) === stablePvpJson(nextLock);
    return {
      party: same ? party : changed(party, { pvpLock: nextLock }),
      value: conflict,
    };
  });
  if (problem) throw new Error(problem);
}

function validateResult(result: PvpResult, snapshot: PvpSnapshot): void {
  if (
    !textId(result.resultId) ||
    !["win", "lose", "draw"].includes(result.outcome) ||
    result.battleId !== snapshot.battleId ||
    result.userId !== snapshot.userId ||
    result.snapshotId !== snapshot.snapshotId ||
    result.baseHash !== snapshot.baseHash ||
    !Array.isArray(result.patches) ||
    result.patches.length !== snapshot.pokemons.length
  )
    throw new Error(
      "El resultado no corresponde a la instantánea reservada de esta cuenta.",
    );
  const captures = new Map(
    snapshot.pokemons.map((capture) => [capture.captureId, capture]),
  );
  const seen = new Set<string>();
  for (const patch of result.patches) {
    const capture = captures.get(patch?.captureId);
    if (
      !capture ||
      seen.has(patch.captureId) ||
      !Number.isSafeInteger(patch.hp) ||
      patch.hp < 0 ||
      patch.hp > (getMaxHp(capture.pokemon) ?? -1) ||
      !Array.isArray(patch.statuses) ||
      patch.statuses.some((status) => !allStatuses.has(status)) ||
      new Set(patch.statuses).size !== patch.statuses.length ||
      patch.statuses.filter((status) => primaryStatuses.has(status)).length >
        1 ||
      !record(patch.statusTurns)
    )
      throw new Error(
        "El resultado contiene capturas, HP o estados no válidos; la partida sigue bloqueada.",
      );
    for (const [status, turns] of Object.entries(patch.statusTurns)) {
      if (
        !(TIMED_STATUSES as readonly string[]).includes(status) ||
        !patch.statuses.includes(status as PokemonStatus) ||
        !validTurns(turns)
      )
        throw new Error(
          "El resultado contiene contadores de estado no válidos.",
        );
    }
    seen.add(patch.captureId);
  }
}

export function applyPvpResult(result: PvpResult): Promise<void> {
  if (!result || result.userId !== activeUserId())
    return Promise.reject(
      new Error(
        "El resultado pertenece a otra cuenta. La partida no se modificó.",
      ),
    );
  return transactPvpParty(result.userId, async (party) => {
    const resultDigest = await digestResult(result);
    const known = party.pvpReceipts?.find(
      (receipt) => receipt.resultId === result.resultId,
    );
    if (known) {
      if (
        known.userId !== result.userId ||
        known.battleId !== result.battleId ||
        known.snapshotId !== result.snapshotId ||
        known.baseHash !== result.baseHash ||
        known.resultDigest !== resultDigest
      )
        throw new Error(
          "Se recibió un resultado distinto con un identificador ya aplicado.",
        );
      return { party, value: undefined };
    }
    const lock = getPvpLock(party);
    if (
      !lock?.snapshot ||
      lock.battleId !== result.battleId ||
      lock.userId !== result.userId ||
      lock.conflict
    )
      throw new Error(
        lock?.conflict ??
          "No existe una instantánea local compatible. Recupera la batalla antes de aplicar el resultado.",
      );
    if (
      lock.phase === "saved" ||
      party.pvpReceipts?.some((receipt) => receipt.battleId === result.battleId)
    )
      throw new Error("Esta batalla ya tiene un resultado guardado diferente.");
    validateResult(result, lock.snapshot);
    if ((await hashPvpPokemons(party.pokemons)) !== lock.snapshot.baseHash)
      throw new Error(
        "El equipo cambió desde la reserva. El resultado no se aplicó y la partida continúa bloqueada.",
      );
    const patches = new Map(
      result.patches.map((patch) => [patch.captureId, patch]),
    );
    const pokemons = party.pokemons.map((capture) => {
      const patch = patches.get(capture.captureId)!;
      return {
        ...capture,
        pokemon: {
          ...capture.pokemon,
          stats: capture.pokemon.stats.map((stat) =>
            stat.name === "hp" ? { ...stat, value: patch.hp } : stat,
          ),
          battleStages: neutralBattleStages(),
        },
        statuses: patch.statuses.filter((status) =>
          primaryStatuses.has(status),
        ),
        statusTurns:
          patch.statuses.includes("asleep") &&
          patch.statusTurns.asleep !== undefined
            ? { asleep: patch.statusTurns.asleep }
            : {},
      };
    });
    const savedAt = new Date().toISOString();
    const receipt: PvpPartyReceipt = {
      battleId: result.battleId,
      resultId: result.resultId,
      userId: result.userId,
      snapshotId: result.snapshotId,
      baseHash: result.baseHash,
      resultDigest,
      savedAt,
    };
    return {
      party: changed(party, {
        pokemons,
        pvpLock: {
          ...lock,
          phase: "saved",
          resultId: result.resultId,
          resultDigest,
          savedAt,
        },
        pvpReceipts: [...(party.pvpReceipts ?? []), receipt].slice(-50),
      }),
      value: undefined,
    };
  });
}

/** The caller must have received authenticated finalized/cancelled server state. */
export function releasePvpParty(
  battleId: string,
  resultId?: string,
): Promise<void> {
  return transactPvpParty(activeUserId(), async (party) => {
    const lock = getPvpLock(party);
    if (!lock) {
      if (
        !resultId ||
        party.pvpReceipts?.some(
          (receipt) =>
            receipt.battleId === battleId && receipt.resultId === resultId,
        )
      )
        return { party, value: undefined };
      throw new Error(
        "No hay un resultado guardado que permita liberar esta batalla.",
      );
    }
    if (lock.battleId !== battleId)
      throw new Error(
        "La confirmación pertenece a otra batalla. El bloqueo se conserva.",
      );
    if (resultId) {
      if (
        lock.phase !== "saved" ||
        lock.resultId !== resultId ||
        !party.pvpReceipts?.some(
          (receipt) =>
            receipt.battleId === battleId && receipt.resultId === resultId,
        )
      )
        throw new Error(
          "Guarda el resultado confirmado antes de liberar la partida.",
        );
    } else if (lock.phase === "saved") {
      throw new Error(
        "Una batalla con resultado necesita la confirmación de finalización.",
      );
    }
    return { party: changed(party, { pvpLock: null }), value: undefined };
  });
}

export function syncPvpSavedParty(userId = activeUserId()): Promise<void> {
  return transactPvpParty(userId, async (party) => ({
    party,
    value: undefined,
  }));
}
