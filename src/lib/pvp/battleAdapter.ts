import {
  createTrainerBattleSession,
  trainerSetupErrors,
  validTrainerBattleSession,
} from "@/lib/trainerBattle/model";
import {
  cancelTrainerAction,
  chooseTrainerAction,
} from "@/lib/trainerBattle/engine";
import { clearBattleConditions } from "@/lib/pokemonCondition";
import { getCurrentHp } from "@/lib/pokemonStats";
import type {
  TrainerBattleSession,
  TrainerSide,
} from "@/lib/trainerBattle/types";
import {
  pvpRequestKey,
  type PvpBattleView,
  type PvpCommand,
  type PvpPatch,
} from "./types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function createPvpTrainerSession(
  state: PvpBattleView,
): TrainerBattleSession {
  if (state.phase !== "ready")
    throw new Error("Espera las instantáneas de ambos jugadores.");
  const session = createTrainerBattleSession();
  session.id = state.battleId;
  session.networkBattleId = state.battleId;
  for (const side of ["a", "b"] as const) {
    const player = state.players[side];
    const snapshot = player.snapshot;
    if (
      !snapshot ||
      snapshot.battleId !== state.battleId ||
      snapshot.userId !== player.user.id ||
      snapshot.clientId !== player.clientId
    )
      throw new Error(
        "La instantánea no corresponde al propietario de este equipo.",
      );
    session.teams[side] = {
      name:
        `${player.user.first_name} ${player.user.last_name}`
          .trim()
          .slice(0, 60) || player.user.email.slice(0, 60),
      pokemons: clone(snapshot.pokemons).map((capture) => ({
        ...capture,
        statuses: [...(capture.statuses ?? [])],
        statusTurns: { ...(capture.statusTurns ?? {}) },
      })),
      activeCaptureId: snapshot.activeCaptureId,
    };
    if (side === "a") session.hpMultiplier = snapshot.hpMultiplier;
  }
  const errors = trainerSetupErrors(session);
  if (errors.length || !validTrainerBattleSession(session))
    throw new Error(
      errors.join(" ") ||
        "Los equipos no tienen datos compatibles con este combate.",
    );
  return session;
}

export function applyPvpTrainerCommand(
  session: TrainerBattleSession,
  command: PvpCommand,
): TrainerBattleSession {
  if (
    !session.networkBattleId ||
    command.requestKey !== pvpRequestKey(session, command.side)
  )
    throw new Error(
      "La acción pertenece a una solicitud anterior del combate. Actualiza la conexión.",
    );
  return command.choice.kind === "cancel"
    ? cancelTrainerAction(session, command.side)
    : chooseTrainerAction(session, command.side, command.choice);
}

export function applyPvpTrainerCommands(
  session: TrainerBattleSession,
  commands: PvpCommand[],
): {
  session: TrainerBattleSession;
  processedCommandIds: string[];
} {
  let next = session;
  const processedCommandIds: string[] = [];
  for (const command of commands) {
    if (processedCommandIds.includes(command.commandId)) continue;
    // Earlier commands can finish a battle or invalidate a later request. Such
    // stale entries are acknowledged as consumed, without applying them again.
    if (
      next.phase !== "finished" &&
      !next.runtime?.ended &&
      command.requestKey === pvpRequestKey(next, command.side)
    ) {
      next = applyPvpTrainerCommand(next, command);
    }
    processedCommandIds.push(command.commandId);
  }
  return { session: next, processedCommandIds };
}

export function pvpTeamPatches(
  session: TrainerBattleSession,
  side: TrainerSide,
): PvpPatch[] {
  if (session.phase !== "finished" || !session.runtime?.ended)
    throw new Error(
      "El combate debe terminar antes de actualizar los equipos.",
    );
  return clone(session.teams[side].pokemons).map((capture) => {
    clearBattleConditions(capture);
    return {
      captureId: capture.captureId,
      hp: getCurrentHp(capture.pokemon),
      statuses: [...(capture.statuses ?? [])],
      statusTurns: { ...(capture.statusTurns ?? {}) },
    };
  });
}

export type PvpCheckpointOutbox = {
  version: 1;
  battleId: string;
  adminUserId: number;
  clientId: string;
  hostEpoch: number;
  expectedCheckpointRevision: number;
  session: TrainerBattleSession;
  processedCommandIds: string[];
};

export function pvpCheckpointOutboxKey(
  battleId: string,
  adminUserId: number,
  clientId: string,
): string {
  return `pokemon-pvp-checkpoint:v1:${adminUserId}:${encodeURIComponent(clientId)}:${encodeURIComponent(battleId)}`;
}

export function writePvpCheckpointOutbox(
  storage: Pick<Storage, "setItem">,
  entry: PvpCheckpointOutbox,
): void {
  if (
    entry.version !== 1 ||
    entry.session.id !== entry.battleId ||
    entry.session.networkBattleId !== entry.battleId ||
    !validTrainerBattleSession(entry.session) ||
    !Number.isSafeInteger(entry.adminUserId) ||
    entry.adminUserId <= 0 ||
    !entry.clientId ||
    !Number.isSafeInteger(entry.hostEpoch) ||
    entry.hostEpoch < 0 ||
    !Number.isSafeInteger(entry.expectedCheckpointRevision) ||
    entry.expectedCheckpointRevision < 0 ||
    !Array.isArray(entry.processedCommandIds) ||
    entry.processedCommandIds.length > 1000 ||
    !entry.processedCommandIds.every(
      (id) => typeof id === "string" && id.length > 0 && id.length <= 200,
    ) ||
    new Set(entry.processedCommandIds).size !== entry.processedCommandIds.length
  )
    throw new Error("No se pudo preparar el guardado de esta transición PvP.");
  storage.setItem(
    pvpCheckpointOutboxKey(entry.battleId, entry.adminUserId, entry.clientId),
    JSON.stringify(entry),
  );
}

export function readPvpCheckpointOutbox(
  storage: Pick<Storage, "getItem">,
  battleId: string,
  adminUserId: number,
  clientId: string,
): PvpCheckpointOutbox | null {
  const raw = storage.getItem(
    pvpCheckpointOutboxKey(battleId, adminUserId, clientId),
  );
  if (raw === null) return null;
  const entry: PvpCheckpointOutbox = JSON.parse(raw);
  if (
    entry.battleId !== battleId ||
    entry.adminUserId !== adminUserId ||
    entry.clientId !== clientId
  )
    throw new Error("La transición guardada pertenece a otra sesión.");
  writePvpCheckpointOutbox({ setItem: () => {} }, entry);
  return entry;
}

export function clearPvpCheckpointOutbox(
  storage: Pick<Storage, "removeItem">,
  battleId: string,
  adminUserId: number,
  clientId: string,
): void {
  storage.removeItem(pvpCheckpointOutboxKey(battleId, adminUserId, clientId));
}
