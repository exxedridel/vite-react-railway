import partyReducer, {
  captureWildOpponent,
  commitEmeraldAction,
  type PartyState,
} from "@/slices/partySlice";
import { transactPvpParty } from "@/store/store";
import { pvpPartyRevision } from "@/store/accountStorage";
import { captureRequirements } from "@/lib/captureRates";
import { getCurrentHp } from "@/lib/pokemonStats";
import { combatKey } from "@/lib/emerald/types";
import { itemUseHash } from "./itemUse";
import {
  BALL_ITEM_IDS,
  type BallItemId,
  type CaptureAttempt,
  type CaptureAttemptResult,
  type CaptureQuote,
  type CaptureSettings,
} from "./types";

const identifier = (value: unknown): value is string =>
  typeof value === "string" && /^[\w.:-]{1,128}$/.test(value);
export const isBallItem = (item: unknown): item is BallItemId =>
  (BALL_ITEM_IDS as readonly unknown[]).includes(item);
export function validCaptureAttempt(value: unknown): value is CaptureAttempt {
  if (!value || typeof value !== "object") return false;
  const attempt = value as CaptureAttempt;
  return (
    attempt.version === 1 &&
    [
      attempt.attemptId,
      attempt.clientId,
      attempt.encounterId,
      attempt.captureId,
      attempt.resultCaptureId,
    ].every(identifier) &&
    Number.isSafeInteger(attempt.userId) &&
    attempt.userId > 0 &&
    isBallItem(attempt.ballId) &&
    Number.isSafeInteger(attempt.minimum) &&
    attempt.minimum >= 1 &&
    attempt.minimum <= 20 &&
    ((attempt.captureRevision === undefined &&
      attempt.captureDifficulty === undefined) ||
      (Number.isSafeInteger(attempt.captureRevision) &&
        Number(attempt.captureRevision) >= 0 &&
        Number.isSafeInteger(attempt.captureDifficulty) &&
        Number(attempt.captureDifficulty) >= 0 &&
        Number(attempt.captureDifficulty) <= 20)) &&
    typeof attempt.pokemonName === "string" &&
    attempt.pokemonName.length > 0 &&
    attempt.pokemonName.length <= 128 &&
    Array.isArray(attempt.seed) &&
    attempt.seed.length === 4 &&
    attempt.seed.every(
      (number) =>
        Number.isSafeInteger(number) && number >= 0 && number <= 65535,
    ) &&
    typeof attempt.expectedCombatHash === "string" &&
    /^[a-f0-9]{64}$/.test(attempt.expectedCombatHash)
  );
}
export function validCaptureResult(
  value: unknown,
): value is CaptureAttemptResult {
  if (!value || typeof value !== "object") return false;
  const result = value as CaptureAttemptResult;
  return (
    identifier(result.attemptId) &&
    Number.isSafeInteger(result.userId) &&
    result.userId > 0 &&
    isBallItem(result.ballId) &&
    typeof result.pokemonName === "string" &&
    result.pokemonName.length > 0 &&
    result.pokemonName.length <= 128 &&
    (result.outcome === "caught"
      ? identifier(result.captureId)
      : result.outcome === "escaped" && result.captureId === undefined)
  );
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function captureParty(
  party: PartyState,
  encounterId: string,
  captureId: string,
): PartyState {
  const action = captureWildOpponent(encounterId);
  action.payload.captureId = captureId;
  const next = partyReducer(party, action);
  if (
    next.pokemons.length !== party.pokemons.length + 1 ||
    !next.pokemons.some(
      (capture) => capture.captureId === captureId && capture.origin === "wild",
    )
  )
    throw new Error(
      "El encuentro no puede capturarse. Revisa el espacio y los movimientos del Pokémon.",
    );
  return next;
}

/** Plan only the paid throw, never the external die outcome. */
export async function prepareBallCaptureParty(
  party: PartyState,
  captureId: string,
  ballId: BallItemId,
  identity: { userId: number; clientId: string; requestId: string },
  seed: [number, number, number, number],
  resultCaptureId: string,
  quote?: CaptureQuote,
  settings?: CaptureSettings,
): Promise<PartyState> {
  if (
    !isBallItem(ballId) ||
    party.pvpLock ||
    party.shopLock ||
    party.resetLock ||
    party.itemUseLock ||
    party.centerLock ||
    party.captureAttempt
  )
    throw new Error(
      "Termina la operación pendiente antes de lanzar una pokebola.",
    );
  const opponent = party.opponent;
  if (!opponent || opponent.kind !== "wild" || !opponent.encounterId)
    throw new Error("Sólo puedes lanzar pokebolas a un Pokémon salvaje.");
  if (party.pokemons.length >= 6)
    throw new Error("Tu equipo está lleno. Libera un espacio antes de lanzar.");
  if (party.pokemons.some((capture) => capture.captureId === resultCaptureId))
    throw new Error(
      "El identificador de la nueva captura ya está en tu equipo.",
    );
  const actor = party.pokemons.find(
    (capture) => capture.captureId === captureId,
  );
  if (!actor || getCurrentHp(actor.pokemon) <= 0)
    throw new Error("Selecciona un Pokémon activo con HP antes de lanzar.");
  if ((party.bag?.items?.[ballId] ?? 0) < 1)
    throw new Error("No quedan existencias de esa pokebola en tu Bag.");
  const ballCode =
    ballId === "poke-ball"
      ? "poke"
      : ballId === "great-ball"
        ? "great"
        : "ultra";
  const minimum = captureRequirements(
    opponent.pokemon,
    opponent.statuses,
    settings?.captureDifficulty ?? 0,
  )?.balls.find((ball) => ball.id === ballCode)?.minimum;
  if (minimum === undefined || minimum === null)
    throw new Error(
      "El Pokémon debe estar vivo y tener un mínimo de captura válido.",
    );
  if (minimum > 20)
    throw new Error(
      "Esta captura es imposible con esa pokebola: el mínimo supera 20. Reduce HP, aplica un estado o elige otra bola.",
    );
  if (
    settings &&
    (!Number.isSafeInteger(settings.captureRevision) ||
      settings.captureRevision < 0)
  )
    throw new Error(
      "La revisión de dificultad no es válida. Actualiza la conexión.",
    );
  if (
    quote &&
    (quote.minimum !== minimum ||
      quote.encounterId !== opponent.encounterId ||
      (quote.captureDifficulty !== undefined &&
        quote.captureDifficulty !== (settings?.captureDifficulty ?? 0)) ||
      (quote.captureRevision !== undefined &&
        quote.captureRevision !== settings?.captureRevision))
  )
    throw new Error(
      "El encuentro o el mínimo cambió. Revisa la captura y confirma de nuevo antes de gastar.",
    );
  // Validate the complete success path before a unit can be debited.
  captureParty(clone(party), opponent.encounterId, resultCaptureId);
  const turn = await import("@/lib/captureTurn");
  turn.assertCaptureTurnAvailable(party, captureId, seed);
  const attempt: CaptureAttempt = {
    version: 1,
    attemptId: identity.requestId,
    userId: identity.userId,
    clientId: identity.clientId,
    ballId,
    minimum,
    ...(settings
      ? {
          captureDifficulty: settings.captureDifficulty,
          captureRevision: settings.captureRevision,
        }
      : {}),
    encounterId: opponent.encounterId,
    pokemonName: opponent.pokemon.name,
    captureId,
    resultCaptureId,
    seed: [...seed],
    expectedCombatHash: await itemUseHash(combatKey(party)),
  };
  if (!validCaptureAttempt(attempt))
    throw new Error("El intento de captura no es válido.");
  return { ...party, captureAttempt: attempt };
}

/** Resolve exactly one already-paid throw; retries reuse its seed and capture ID. */
export async function resolveCaptureAttempt(
  userId: number,
  attemptId: string,
  outcome: "caught" | "escaped",
): Promise<{ outcome: "caught" | "escaped"; pokemonName: string }> {
  if (!identifier(attemptId) || !["caught", "escaped"].includes(outcome))
    throw new Error("El resultado de captura no es válido.");
  const turn = await import("@/lib/captureTurn");
  return transactPvpParty(userId, async (party) => {
    const previous = party.lastCaptureResult;
    if (previous?.attemptId === attemptId && previous.userId === userId) {
      if (previous.outcome !== outcome)
        throw new Error("Este lanzamiento ya tiene otro resultado guardado.");
      return {
        party,
        value: { outcome: previous.outcome, pokemonName: previous.pokemonName },
      };
    }
    const attempt = party.captureAttempt;
    if (
      !validCaptureAttempt(attempt) ||
      attempt.attemptId !== attemptId ||
      attempt.userId !== userId
    )
      throw new Error(
        "No se encontró ese lanzamiento pendiente en esta cuenta.",
      );
    if (
      party.itemUseLock ||
      party.pvpLock ||
      party.shopLock ||
      party.resetLock ||
      party.centerLock
    )
      throw new Error(
        "Confirma el consumo de la pokebola antes de registrar la tirada.",
      );
    if (
      party.opponent?.encounterId !== attempt.encounterId ||
      (await itemUseHash(combatKey(party))) !== attempt.expectedCombatHash
    )
      throw new Error(
        "El encuentro cambió. Conserva el navegador original para recuperar el lanzamiento.",
      );
    const clean = { ...party, captureAttempt: undefined };
    let next: PartyState;
    if (outcome === "caught")
      next = captureParty(clean, attempt.encounterId, attempt.resultCaptureId);
    else {
      const id = `ball-miss:${attemptId}`;
      const update = turn.runFailedCaptureTurn(
        clean,
        attempt.captureId,
        attempt.seed,
        id,
      );
      next = partyReducer(
        clean,
        commitEmeraldAction({ expected: combatKey(clean), update, id }),
      );
      if (next.lastEmeraldBatch?.id !== id)
        throw new Error("No se pudo guardar la respuesta del Pokémon salvaje.");
    }
    const result: CaptureAttemptResult = {
      attemptId,
      userId,
      ballId: attempt.ballId,
      pokemonName: attempt.pokemonName,
      outcome,
      ...(outcome === "caught" ? { captureId: attempt.resultCaptureId } : {}),
    };
    return {
      party: {
        ...next,
        captureAttempt: undefined,
        lastCaptureResult: result,
        pvpRevision:
          Math.max(pvpPartyRevision(next), pvpPartyRevision(party)) + 1,
      },
      value: { outcome, pokemonName: attempt.pokemonName },
    };
  });
}
