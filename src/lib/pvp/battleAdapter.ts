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
import { getCurrentMovePp } from "@/lib/movePp";
import type {
  TrainerBattleSession,
  TrainerSide,
} from "@/lib/trainerBattle/types";
import {
  isTrainerBattle,
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
    throw new Error("Espera a que los equipos estén preparados.");
  const session = createTrainerBattleSession();
  session.id = state.battleId;
  session.networkBattleId = state.battleId;
  const trainerBattle = isTrainerBattle(state);
  const humanSides = trainerBattle ? (["a"] as const) : (["a", "b"] as const);
  for (const side of humanSides) {
    const player = state.players[side];
    const snapshot = player?.snapshot;
    if (
      !player ||
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
  if (trainerBattle) {
    if (
      state.players.b ||
      state.trainer?.region !== "kanto" ||
      !state.trainer.presetId ||
      !state.trainer.team
    )
      throw new Error("Falta el equipo confirmado del Trainer seleccionado.");
    session.teams.b = clone(state.trainer.team);
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
  const networkItems = clone(session.networkItems ?? { pending: {}, used: [] });
  if (command.choice.kind === "item") {
    if (!command.inventoryAuthorized)
      throw new Error(
        "Nest debe autorizar las existencias del objeto antes de usarlo.",
      );
    networkItems.pending[command.side] = {
      commandId: command.commandId,
      captureId: command.choice.captureId,
      itemId: command.choice.item,
      ...(command.choice.moveId !== undefined
        ? { moveId: command.choice.moveId }
        : {}),
    };
  }
  const input = { ...session, networkItems };
  const next =
    command.choice.kind === "cancel"
      ? cancelTrainerAction(input, command.side)
      : chooseTrainerAction(input, command.side, command.choice, {
          allowNetworkItem:
            command.choice.kind === "item" && !!command.inventoryAuthorized,
          onItemUsed: (side, captureId, itemId = "full-restore", moveId) => {
            const pending = networkItems.pending[side];
            if (
              !pending ||
              pending.captureId !== captureId ||
              (pending.itemId ?? "full-restore") !== itemId ||
              pending.moveId !== moveId
            )
              throw new Error(
                "La curación no tiene una reserva de inventario correspondiente.",
              );
            if (!networkItems.used.includes(pending.commandId))
              networkItems.used.push(pending.commandId);
            delete networkItems.pending[side];
          },
        });
  if (command.choice.kind === "cancel")
    delete networkItems.pending[command.side];
  if (next.phase === "finished" || next.runtime?.ended)
    networkItems.pending = {};
  return { ...next, networkItems };
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
      ...(capture.moves?.some((move) => move.currentPp !== undefined)
        ? {
            movesPp: capture.moves.map((move) => ({
              moveId: move.id,
              currentPp: getCurrentMovePp(move),
            })),
          }
        : {}),
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
