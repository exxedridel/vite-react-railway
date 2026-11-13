import type { PartyState } from "@/slices/partySlice";
import { transactPvpParty } from "@/store/store";
import { pvpPartyRevision } from "@/store/accountStorage";
import {
  getCurrentHp,
  getMaxHp,
  isLeveled,
  neutralBattleStages,
} from "@/lib/pokemonStats";
import { getCurrentMovePp, getMaxMovePp, restoreMovePp } from "@/lib/movePp";
import { hashPvpPokemons } from "@/lib/pvpParty";
import { localBattleActive } from "./wallet";
import type {
  CenterHeal,
  CenterLock,
  CenterPrepare,
  CenterPreview,
} from "./types";
import type { CapturedPokemon } from "@/types/pokemon";

const id = (value: unknown): value is string =>
  typeof value === "string" && /^[\w.:-]{1,128}$/.test(value);
const revision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const positive = (value: unknown): value is number =>
  revision(value) && value > 0;
const hash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const validCenterCaptureIds = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length >= 1 &&
  value.length <= 2 &&
  value.every(id) &&
  new Set(value).size === value.length;

export function validCenterHeal(value: unknown): value is CenterHeal {
  if (!record(value)) return false;
  return (
    id(value.requestId) &&
    id(value.clientId) &&
    positive(value.userId) &&
    positive(value.adminUserId) &&
    validCenterCaptureIds(value.captureIds) &&
    hash(value.partyHash) &&
    hash(value.planHash) &&
    revision(value.partyRevision) &&
    positive(value.centerRevision) &&
    ["pending", "applied", "cancelled"].includes(String(value.status))
  );
}
export function validCenterPrepare(value: unknown): value is CenterPrepare {
  if (!record(value)) return false;
  return validCenterHeal({
    ...value,
    userId: value.playerUserId,
    planHash: "0".repeat(64),
    status: "pending",
  });
}
export function validCenterPreview(value: unknown): value is CenterPreview {
  if (
    !record(value) ||
    !positive(value.userId) ||
    !id(value.clientId) ||
    !revision(value.partyRevision) ||
    !hash(value.partyHash) ||
    !Array.isArray(value.pokemons) ||
    value.pokemons.length < 1 ||
    value.pokemons.length > 6
  )
    return false;
  const ids = new Set<string>();
  return value.pokemons.every((pokemon: unknown) => {
    if (
      !record(pokemon) ||
      !id(pokemon.captureId) ||
      ids.has(pokemon.captureId) ||
      !positive(pokemon.pokemonId) ||
      pokemon.pokemonId > 386 ||
      typeof pokemon.name !== "string" ||
      pokemon.name.length > 100 ||
      !(
        pokemon.image === null ||
        (typeof pokemon.image === "string" && pokemon.image.length <= 2048)
      ) ||
      !positive(pokemon.level) ||
      pokemon.level > 100 ||
      !revision(pokemon.currentHp) ||
      !positive(pokemon.maxHp) ||
      pokemon.currentHp > pokemon.maxHp ||
      !Array.isArray(pokemon.statuses) ||
      pokemon.statuses.length > 32 ||
      !pokemon.statuses.every((s) => typeof s === "string" && s.length <= 64) ||
      typeof pokemon.needsHealing !== "boolean" ||
      !Array.isArray(pokemon.moves) ||
      pokemon.moves.length > 4
    )
      return false;
    ids.add(pokemon.captureId);
    return pokemon.moves.every(
      (move: unknown) =>
        record(move) &&
        positive(move.id) &&
        move.id <= 354 &&
        typeof move.name === "string" &&
        move.name.length <= 100 &&
        revision(move.currentPp) &&
        revision(move.maxPp) &&
        move.currentPp <= move.maxPp &&
        move.maxPp <= 100,
    );
  });
}

function assertAvailable(party: PartyState): void {
  if (
    localBattleActive(party) ||
    party.shopLock ||
    party.resetLock ||
    party.itemUseLock ||
    party.centerLock ||
    party.captureAttempt
  )
    throw new Error(
      "Termina la batalla u operación pendiente antes de usar Poké Center.",
    );
  if (!party.pokemons.length || party.pokemons.length > 6)
    throw new Error("Poké Center requiere un equipo de entre 1 y 6 Pokémon.");
}
export function needsCenterHealing(capture: CapturedPokemon): boolean {
  return (
    getCurrentHp(capture.pokemon) < (getMaxHp(capture.pokemon) ?? 0) ||
    !!capture.statuses?.length ||
    !!Object.keys(capture.statusTurns ?? {}).length ||
    Object.values(capture.pokemon.battleStages ?? {}).some(
      (stage) => stage !== 0,
    ) ||
    !!capture.moves?.some((move) => getCurrentMovePp(move) < getMaxMovePp(move))
  );
}

/** The Center changes only the selected captures' recoverable resources. */
export function restoreCenterPokemons(
  party: PartyState,
  captureIds: string[],
): CapturedPokemon[] {
  if (!validCenterCaptureIds(captureIds))
    throw new Error("Elige uno o dos Pokémon distintos.");
  return captureIds.map((captureId) => {
    const capture = party.pokemons.find(
      (entry) => entry.captureId === captureId,
    );
    if (!capture || !isLeveled(capture.pokemon))
      throw new Error("El Pokémon seleccionado ya no pertenece al equipo.");
    const maxHp = getMaxHp(capture.pokemon);
    if (!maxHp || !capture.pokemon.stats.some((stat) => stat.name === "hp"))
      throw new Error(
        "El Pokémon no tiene estadísticas válidas para recuperarse.",
      );
    return {
      ...clone(capture),
      pokemon: {
        ...clone(capture.pokemon),
        stats: capture.pokemon.stats.map((stat) =>
          stat.name === "hp" ? { ...stat, value: maxHp } : { ...stat },
        ),
        battleStages: neutralBattleStages(),
      },
      statuses: [],
      statusTurns: {},
      moves: capture.moves?.map(restoreMovePp),
    };
  });
}

export function previewCenterParty(
  userId: number,
  clientId: string,
): Promise<CenterPreview> {
  return transactPvpParty(userId, async (party) => {
    assertAvailable(party);
    const preview: CenterPreview = {
      userId,
      clientId,
      partyRevision: pvpPartyRevision(party),
      partyHash: await hashPvpPokemons(party.pokemons),
      pokemons: party.pokemons.map((capture) => ({
        captureId: capture.captureId,
        pokemonId: capture.pokemon.id,
        name: capture.pokemon.name,
        image: capture.pokemon.image,
        level: capture.pokemon.level ?? 0,
        currentHp: getCurrentHp(capture.pokemon),
        maxHp: getMaxHp(capture.pokemon) ?? 0,
        statuses: [...(capture.statuses ?? [])],
        moves: (capture.moves ?? []).map((move) => ({
          id: move.id,
          name: move.displayName || move.name,
          currentPp: getCurrentMovePp(move),
          maxPp: getMaxMovePp(move),
        })),
        needsHealing: needsCenterHealing(capture),
      })),
    };
    if (!validCenterPreview(preview))
      throw new Error(
        "El equipo necesita datos válidos antes de ingresar a Poké Center.",
      );
    return { party, value: preview };
  });
}

/** Checked local reservation and immutable plan are saved before PREPARE ACK. */
export function prepareCenterHealing(
  request: CenterPrepare,
  clientId: string,
): Promise<CenterLock> {
  if (!validCenterPrepare(request) || request.clientId !== clientId)
    return Promise.reject(
      new Error("La recuperación no pertenece a este navegador."),
    );
  return transactPvpParty(request.playerUserId, async (party) => {
    const existing = party.centerLock;
    if (
      existing &&
      existing.requestId === request.requestId &&
      existing.clientId === clientId &&
      existing.adminUserId === request.adminUserId &&
      existing.partyHash === request.partyHash &&
      existing.partyRevision === request.partyRevision &&
      existing.centerRevision === request.centerRevision &&
      JSON.stringify(existing.captureIds) === JSON.stringify(request.captureIds)
    )
      return { party, value: existing };
    assertAvailable(party);
    if (request.centerRevision <= (party.centerHealingRevision ?? 0))
      throw new Error("Esta recuperación ya terminó. Actualiza el equipo.");
    if (
      pvpPartyRevision(party) !== request.partyRevision ||
      (await hashPvpPokemons(party.pokemons)) !== request.partyHash
    )
      throw new Error(
        "El equipo cambió. Carga de nuevo la Party antes de recuperarla.",
      );
    const preparedPokemons = restoreCenterPokemons(party, request.captureIds);
    const lock: CenterLock = {
      requestId: request.requestId,
      adminUserId: request.adminUserId,
      userId: request.playerUserId,
      clientId,
      captureIds: [...request.captureIds],
      partyHash: request.partyHash,
      partyRevision: request.partyRevision,
      centerRevision: request.centerRevision,
      planHash: await hashPvpPokemons(preparedPokemons),
      preparedPokemons,
    };
    return {
      party: {
        ...party,
        pvpRevision: pvpPartyRevision(party) + 1,
        centerLock: lock,
      },
      value: lock,
    };
  });
}

/** A receipt never reconstructs a missing plan or restores resources twice. */
export function applyCenterHealing(
  receipt: CenterHeal,
  clientId: string,
): Promise<"pending" | "applied" | "cancelled" | "ignored"> {
  if (!validCenterHeal(receipt))
    return Promise.reject(new Error("La recuperación recibida no es válida."));
  return transactPvpParty(receipt.userId, async (party) => {
    const lock = party.centerLock;
    const matches =
      lock?.requestId === receipt.requestId &&
      lock.userId === receipt.userId &&
      lock.clientId === receipt.clientId;
    if (
      receipt.status === "pending" &&
      receipt.centerRevision <= (party.centerHealingRevision ?? 0)
    )
      return { party, value: "ignored" as const };
    if (!matches) {
      if (
        receipt.status !== "pending" &&
        !lock &&
        receipt.centerRevision > (party.centerHealingRevision ?? 0)
      )
        return {
          party: {
            ...party,
            pvpRevision: pvpPartyRevision(party) + 1,
            centerHealingRevision: receipt.centerRevision,
          },
          value: receipt.status,
        };
      return { party, value: "ignored" as const };
    }
    if (
      receipt.status === "pending" &&
      (receipt.clientId !== clientId || lock.clientId !== clientId)
    )
      return { party, value: "ignored" as const };
    if (
      lock.planHash !== receipt.planHash ||
      lock.partyHash !== receipt.partyHash ||
      lock.partyRevision !== receipt.partyRevision ||
      lock.adminUserId !== receipt.adminUserId ||
      lock.centerRevision !== receipt.centerRevision ||
      JSON.stringify(lock.captureIds) !== JSON.stringify(receipt.captureIds)
    )
      throw new Error(
        "La confirmación no coincide con la recuperación preparada.",
      );
    if (
      party.pvpLock ||
      party.shopLock ||
      party.resetLock ||
      party.itemUseLock ||
      localBattleActive(party) ||
      party.captureAttempt
    )
      throw new Error(
        "La Party conserva otra operación; no se sobrescribió el equipo.",
      );
    let next = party;
    if (receipt.status !== "cancelled" && !lock.applied) {
      if (
        (await hashPvpPokemons(party.pokemons)) !== lock.partyHash ||
        (await hashPvpPokemons(lock.preparedPokemons)) !== lock.planHash
      )
        throw new Error(
          "La Party no coincide con el plan de recuperación. Conserva el navegador original.",
        );
      const restored = new Map(
        lock.preparedPokemons.map((capture) => [capture.captureId, capture]),
      );
      next = {
        ...party,
        pokemons: party.pokemons.map(
          (capture) => restored.get(capture.captureId) ?? capture,
        ),
        centerLock: { ...lock, applied: true },
        pvpRevision: pvpPartyRevision(party) + 1,
      };
    }
    if (receipt.status !== "pending")
      next = {
        ...next,
        centerLock: undefined,
        centerHealingRevision: Math.max(
          party.centerHealingRevision ?? 0,
          receipt.centerRevision,
        ),
        pvpRevision: pvpPartyRevision(next) + 1,
      };
    return { party: next, value: receipt.status };
  });
}

export function centerCancelPayload(lock: CenterLock) {
  const { preparedPokemons: _, applied: __, userId, ...request } = lock;
  return { ...request, playerUserId: userId };
}
