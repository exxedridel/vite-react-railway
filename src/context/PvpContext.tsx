import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import type { ChatUser } from "@/lib/testMessages";
import { testMessagesUrl } from "@/lib/testMessages";
import {
  pvpRequestKey,
  type PvpAck,
  type PvpBattleView,
  type PvpChoice,
  type PvpLobbyPlayer,
} from "@/lib/pvp/types";
import type {
  TrainerBattleSession,
  TrainerSide,
} from "@/lib/trainerBattle/types";
import { store } from "@/store/store";
import {
  applyPvpResult,
  getPvpLock,
  holdPvpParty,
  recoverPvpPartyLock,
  releasePvpParty,
  reservePvpParty,
  setPvpSyncBlocked,
  syncPvpSavedParty,
} from "@/lib/pvpParty";

type PvpContextValue = {
  user: ChatUser | null;
  clientId: string;
  connected: boolean;
  synced: boolean;
  error: string;
  state: PvpBattleView | null;
  lobby: PvpLobbyPlayer[];
  busy: boolean;
  sync: () => Promise<PvpBattleView | null>;
  createBattle: (
    playerAId: number,
    playerBId: number,
  ) => Promise<PvpBattleView | null>;
  createTrainerBattle: (
    playerAId: number,
    trainerPresetId: string,
  ) => Promise<PvpBattleView | null>;
  claimBattle: () => Promise<PvpBattleView | null>;
  cancelBattle: () => Promise<PvpBattleView | null>;
  sendCommand: (
    side: TrainerSide,
    choice: PvpChoice,
  ) => Promise<PvpBattleView | null>;
  publishCheckpoint: (
    session: TrainerBattleSession,
    processedCommandIds: string[],
    expectedCheckpointRevision: number,
  ) => Promise<PvpBattleView | null>;
  finalizeBattle: () => Promise<PvpBattleView | null>;
};
const PvpContext = createContext<PvpContextValue | null>(null);
export function usePvpContext() {
  const value = useContext(PvpContext);
  if (!value) throw new Error("La conexión PvP no está disponible.");
  return value;
}
const TERMINAL = new Set(["finalized", "cancelled"]);
const SESSION_ERRORS = new Set([
  "TOKEN_REQUIRED",
  "TOKEN_EXPIRED",
  "INVALID_TOKEN",
  "SESSION_REVOKED",
  "ACCOUNT_NOT_FOUND",
]);
const ACK_TIMEOUT = 15000;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo sincronizar la batalla.";
function readToken() {
  try {
    return localStorage.getItem("bearer_token");
  } catch {
    return null;
  }
}
function clientFor(user: ChatUser): string {
  const storage = user.role === "admin" ? sessionStorage : localStorage;
  const key = `pokemon-pvp-client:v1:${user.role}:${user.id}`;
  const found = storage.getItem(key);
  if (found && /^[\w.:-]{8,128}$/.test(found)) return found;
  const id = crypto.randomUUID();
  storage.setItem(key, id);
  return id;
}
function validState(value: unknown): value is PvpBattleView {
  if (!value || typeof value !== "object") return false;
  const state = value as PvpBattleView;
  return (
    typeof state.battleId === "string" &&
    Number.isSafeInteger(state.revision) &&
    [
      "collecting",
      "ready",
      "active",
      "finished",
      "finalizing",
      "finalized",
      "cancelled",
    ].includes(state.phase) &&
    !!state.host &&
    !!state.players?.a?.user &&
    (state.mode === "trainer"
      ? state.players.b === undefined &&
        state.trainer?.region === "kanto" &&
        typeof state.trainer.presetId === "string" &&
        state.trainer.presetId.length > 0
      : (state.mode === undefined || state.mode === "pvp") &&
        !!state.players?.b?.user)
  );
}

export default function PvpProvider({
  user,
  onSessionExpired,
  children,
}: {
  user: ChatUser | null;
  onSessionExpired: (token?: string) => Promise<unknown>;
  children: ReactNode;
}) {
  const [clientId, setClientId] = useState("");
  const [connected, setConnected] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<PvpBattleView | null>(null);
  const [lobby, setLobby] = useState<PvpLobbyPlayer[]>([]);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const expiryRef = useRef(onSessionExpired);
  expiryRef.current = onSessionExpired;
  const clientRef = useRef("");
  const stateRef = useRef<PvpBattleView | null>(null);
  const generation = useRef(0);
  const reconcileQueue = useRef(Promise.resolve());
  const incomingVersion = useRef(0);
  const sentSnapshots = useRef(new Set<string>());
  const mutations = useRef(0);
  const queueStateRef = useRef<(next: PvpBattleView | null) => void>(() => {});

  const emit = useCallback(
    async (
      event: string,
      payload: unknown,
    ): Promise<Extract<PvpAck, { ok: true }>> => {
      const socket = socketRef.current;
      const owner = userRef.current?.id;
      if (!socket?.connected)
        throw new Error("Reconecta con el servidor de batalla para continuar.");
      const requestToken =
        typeof socket.auth === "object"
          ? (socket.auth.token as string)
          : undefined;
      return new Promise((resolve, reject) => {
        socket
          .timeout(ACK_TIMEOUT)
          .emit(event, payload, (timeout: Error | null, response: PvpAck) => {
            if (
              socketRef.current !== socket ||
              userRef.current?.id !== owner ||
              readToken() !== requestToken
            ) {
              reject(new Error("La sesión cambió durante la sincronización."));
              return;
            }
            if (timeout) {
              reject(
                new Error(
                  "No llegó la confirmación. Reconecta para recuperar el estado guardado.",
                ),
              );
              return;
            }
            if (!response || response.ok !== true) {
              const detail = response && !response.ok ? response.error : null;
              if (detail && SESSION_ERRORS.has(detail.code))
                void expiryRef.current(requestToken);
              reject(
                new Error(
                  detail?.message ||
                    "El servidor rechazó la operación de batalla.",
                ),
              );
              return;
            }
            if (response.state !== null && !validState(response.state)) {
              reject(
                new Error(
                  "La respuesta de batalla no es compatible con esta versión.",
                ),
              );
              return;
            }
            if (response.lobby) setLobby(response.lobby);
            resolve(response);
          });
      });
    },
    [],
  );

  const sync = useCallback(async () => {
    const socket = socketRef.current;
    if (socket && !socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const done = () => {
          cleanup();
          resolve();
        };
        const fail = (reason: Error) => {
          cleanup();
          reject(reason);
        };
        const timer = window.setTimeout(
          () => fail(new Error("No se pudo recuperar la conexión de batalla.")),
          ACK_TIMEOUT,
        );
        const cleanup = () => {
          window.clearTimeout(timer);
          socket.off("connect", done);
          socket.off("connect_error", fail);
        };
        socket.once("connect", done);
        socket.once("connect_error", fail);
        socket.connect();
      });
    }
    const current = stateRef.current;
    const lock = getPvpLock(store.getState().party);
    const battleId =
      lock?.battleId ??
      (current && !TERMINAL.has(current.phase) ? current.battleId : undefined);
    const response = await emit("pvp:sync", battleId ? { battleId } : {});
    queueStateRef.current(response.state);
    return response.state;
  }, [emit]);

  useEffect(() => {
    const run = ++generation.current;
    setState(null);
    stateRef.current = null;
    setLobby([]);
    setClientId("");
    clientRef.current = "";
    setSynced(false);
    setConnected(false);
    setError("");
    setBusy(false);
    mutations.current = 0;
    sentSnapshots.current.clear();
    if (!user) {
      setPvpSyncBlocked(false);
      return;
    }
    const actor: ChatUser = user;
    setPvpSyncBlocked(actor.role === "player");
    let id: string, token: string, endpoint: string;
    try {
      id = clientFor(actor);
      const saved = readToken();
      if (!saved) throw new Error("Inicia sesión para conectar tu equipo.");
      token = saved;
      endpoint = new URL(
        "/pvp",
        testMessagesUrl(
          import.meta.env.VITE_WEBSOCKET_URL,
          import.meta.env.VITE_BASE_SERVICES,
        ),
      ).toString();
    } catch (reason) {
      setError(messageOf(reason));
      return;
    }
    clientRef.current = id;
    setClientId(id);
    const socket = io(endpoint, {
      auth: { token, clientId: id },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: ACK_TIMEOUT,
    });
    socketRef.current = socket;
    let needsInitialSync = true;
    const current = () =>
      generation.current === run &&
      socketRef.current === socket &&
      userRef.current?.id === actor.id;

    async function reconcile(next: PvpBattleView | null) {
      if (!current()) return;
      if (actor.role === "admin") {
        needsInitialSync = false;
        setSynced(true);
        return;
      }
      const lock = getPvpLock(store.getState().party);
      if (!next) {
        if (lock)
          throw new Error(
            "Tu equipo sigue reservado. Reconecta para recuperar la batalla; el bloqueo no se elimina al perder la conexión.",
          );
        setPvpSyncBlocked(false);
        needsInitialSync = false;
        setSynced(true);
        return;
      }
      const side =
        next.side ??
        (next.players.a.user.id === actor.id
          ? "a"
          : next.players.b?.user.id === actor.id
            ? "b"
            : null);
      if (!side)
        throw new Error("La batalla recibida no pertenece a esta cuenta.");
      const owner = next.players[side];
      if (!owner || owner.user.id !== actor.id)
        throw new Error("La batalla recibida no pertenece a esta cuenta.");
      const snapshot = next.snapshot ?? owner.snapshot;
      if (
        next.phase === "finalized" &&
        !lock &&
        next.result &&
        store
          .getState()
          .party.pvpReceipts?.some(
            (receipt) =>
              receipt.battleId === next.battleId &&
              receipt.resultId === next.result!.resultId,
          )
      ) {
        // Presence updates can replay the completed envelope. Verify its receipt
        // without reserving an already-released party or disturbing later play.
        await applyPvpResult(next.result);
        setPvpSyncBlocked(false);
        needsInitialSync = false;
        setSynced(true);
        return;
      }
      if (next.phase === "cancelled") {
        if (lock?.battleId === next.battleId)
          await releasePvpParty(next.battleId);
        setPvpSyncBlocked(false);
        needsInitialSync = false;
        setSynced(true);
        return;
      }
      if (
        snapshot &&
        (!lock?.snapshot || lock.snapshot.snapshotId !== snapshot.snapshotId)
      ) {
        await recoverPvpPartyLock(snapshot);
      } else if (!lock) {
        await holdPvpParty({
          battleId: next.battleId,
          userId: actor.id,
          clientId: owner.clientId,
        });
      }
      if (!current()) return;
      if (next.phase === "collecting" && owner.clientId === id && !snapshot) {
        const key = next.battleId;
        if (!sentSnapshots.current.has(key)) {
          try {
            const prepared = await reservePvpParty({
              battleId: key,
              userId: actor.id,
              clientId: id,
            });
            if (!current()) return;
            const response = await emit("pvp:snapshot", { snapshot: prepared });
            sentSnapshots.current.add(key);
            queueStateRef.current(response.state);
          } catch (reason) {
            // A bad/empty team cannot strand the other participant in preparation.
            const latest = stateRef.current;
            if (
              current() &&
              latest?.battleId === key &&
              latest.phase === "collecting"
            ) {
              try {
                const response = await emit("pvp:decline", {
                  battleId: key,
                  reason: messageOf(reason).slice(0, 500),
                });
                queueStateRef.current(response.state);
              } catch {
                /* Reservation stays until an authoritative cancellation is recovered. */
              }
            }
            throw reason;
          }
        }
      }
      if (next.result && ["finalizing", "finalized"].includes(next.phase)) {
        await applyPvpResult(next.result);
        if (!current()) return;
        if (owner.clientId === id && next.phase === "finalizing") {
          const response = await emit("pvp:applied", {
            battleId: next.battleId,
            resultId: next.result.resultId,
            snapshotId: next.result.snapshotId,
            baseHash: next.result.baseHash,
          });
          queueStateRef.current(response.state);
        }
      }
      if (next.phase === "finalized") {
        if (getPvpLock(store.getState().party)?.battleId === next.battleId)
          await releasePvpParty(next.battleId, next.result?.resultId);
        setPvpSyncBlocked(false);
      } else {
        setPvpSyncBlocked(true);
        if (owner.clientId !== id)
          setError(
            "Este equipo ingresó desde otro navegador. Reconecta el dispositivo que lo envió para continuar.",
          );
      }
      needsInitialSync = false;
      setSynced(true);
    }

    function receive(next: PvpBattleView | null) {
      if (!current()) return;
      if (next !== null && !validState(next)) {
        setError("El servidor envió una batalla incompatible.");
        return;
      }
      const prior = stateRef.current;
      if (
        next &&
        prior &&
        next.battleId === prior.battleId &&
        next.revision < prior.revision
      )
        return;
      if (
        next &&
        prior &&
        next.battleId !== prior.battleId &&
        !TERMINAL.has(prior.phase)
      )
        return;
      if (next === null && getPvpLock(store.getState().party)) {
        setError(
          "Falta recuperar la batalla de tu equipo. Mantén la cuenta conectada y reintenta.",
        );
        return;
      }
      stateRef.current = next;
      setState(next);
      if (actor.role === "player" && next && !TERMINAL.has(next.phase))
        setPvpSyncBlocked(true);
      const order = ++incomingVersion.current;
      reconcileQueue.current = reconcileQueue.current
        .catch(() => {})
        .then(async () => {
          if (!current() || order !== incomingVersion.current) return;
          try {
            await reconcile(next);
          } catch (reason) {
            if (current()) {
              setError(messageOf(reason));
              setSynced(false);
            }
          }
        });
    }
    queueStateRef.current = receive;
    socket.on("connect", () => {
      if (!current()) return;
      setConnected(true);
      setError("");
      sentSnapshots.current.clear();
      needsInitialSync = true;
      if (actor.role === "player") {
        setPvpSyncBlocked(true);
        setSynced(false);
      }
      void sync().catch((reason) => {
        if (current()) setError(messageOf(reason));
      });
    });
    socket.on("disconnect", () => {
      if (!current()) return;
      setConnected(false);
      // Known reservations survive disconnect. An idle, already-verified party can keep playing locally.
      if (
        getPvpLock(store.getState().party) ||
        (stateRef.current && !TERMINAL.has(stateRef.current.phase))
      )
        setError(
          "Se perdió la conexión. Tu equipo sigue reservado hasta recuperar y cerrar la batalla.",
        );
    });
    socket.on("connect_error", (reason) => {
      if (!current()) return;
      setConnected(false);
      setError(
        reason.message || "No se pudo conectar con el servidor de batalla.",
      );
      if (SESSION_ERRORS.has(reason.data?.code)) void expiryRef.current(token);
    });
    socket.on("pvp:state", receive);
    socket.on("pvp:lobby", (entries) => {
      if (current() && Array.isArray(entries)) setLobby(entries);
    });
    socket.on("pvp:error", (detail) => {
      if (!current()) return;
      setError(detail?.message || "No se pudo sincronizar la batalla.");
      if (SESSION_ERRORS.has(detail?.code)) void expiryRef.current(token);
    });
    function refreshSaved(event: StorageEvent) {
      if (!current() || actor.role !== "player") return;
      if (event.key === `persist:root:user:${actor.id}`) {
        void syncPvpSavedParty()
          .then(() => {
            if (socket.connected) return sync();
          })
          .catch((reason) => {
            if (current()) setError(messageOf(reason));
          });
      }
    }
    window.addEventListener("storage", refreshSaved);
    const timer = window.setInterval(() => {
      if (!current()) return;
      if (readToken() !== token) {
        socket.disconnect();
        return;
      }
      if (!socket.connected) {
        socket.connect();
        return;
      }
      const pending =
        getPvpLock(store.getState().party) ||
        (stateRef.current && !TERMINAL.has(stateRef.current.phase));
      if (pending || needsInitialSync)
        void sync().catch((reason) => {
          if (current()) setError(messageOf(reason));
        });
    }, 5000);
    socket.connect();
    return () => {
      ++generation.current;
      window.clearInterval(timer);
      window.removeEventListener("storage", refreshSaved);
      if (socketRef.current === socket) socketRef.current = null;
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [user, emit, sync]);

  const mutate = useCallback(
    async (event: string, payload: unknown) => {
      const run = generation.current;
      mutations.current++;
      setBusy(true);
      setError("");
      try {
        const response = await emit(event, payload);
        queueStateRef.current(response.state);
        return response.state;
      } catch (reason) {
        if (generation.current === run) {
          setError(messageOf(reason));
          if (socketRef.current?.connected) void sync().catch(() => {});
        }
        throw reason;
      } finally {
        if (generation.current === run) {
          mutations.current = Math.max(0, mutations.current - 1);
          setBusy(mutations.current > 0);
        }
      }
    },
    [emit, sync],
  );
  const requireState = () => {
    const battle = stateRef.current;
    if (!battle) throw new Error("No hay una batalla conectada.");
    return battle;
  };
  const createBattle = (playerAId: number, playerBId: number) =>
    mutate("pvp:create", {
      commandId: crypto.randomUUID(),
      playerAId,
      playerBId,
    });
  const createTrainerBattle = (playerAId: number, trainerPresetId: string) =>
    mutate("pvp:create", {
      commandId: crypto.randomUUID(),
      playerAId,
      trainerPresetId,
    });
  const claimBattle = () =>
    mutate("pvp:claim", { battleId: requireState().battleId });
  const cancelBattle = () => {
    const battle = requireState();
    return mutate("pvp:cancel", {
      battleId: battle.battleId,
      hostEpoch: battle.host.epoch,
    });
  };
  const finalizeBattle = () => {
    const battle = requireState();
    return mutate("pvp:finalize", {
      battleId: battle.battleId,
      hostEpoch: battle.host.epoch,
    });
  };
  const sendCommand = (side: TrainerSide, choice: PvpChoice) => {
    const battle = requireState();
    if (!battle.session?.runtime)
      return Promise.reject(new Error("Primero inicia la batalla."));
    return mutate("pvp:command", {
      battleId: battle.battleId,
      commandId: crypto.randomUUID(),
      side,
      choice,
      requestKey: pvpRequestKey(battle.session, side),
    });
  };
  const publishCheckpoint = (
    session: TrainerBattleSession,
    processedCommandIds: string[],
    expectedCheckpointRevision: number,
  ) => {
    const battle = requireState();
    return mutate("pvp:checkpoint", {
      battleId: battle.battleId,
      hostEpoch: battle.host.epoch,
      expectedCheckpointRevision,
      session,
      processedCommandIds,
    });
  };
  return (
    <PvpContext.Provider
      value={{
        user,
        clientId,
        connected,
        synced,
        error,
        state,
        lobby,
        busy,
        sync,
        createBattle,
        createTrainerBattle,
        claimBattle,
        cancelBattle,
        sendCommand,
        publishCheckpoint,
        finalizeBattle,
      }}
    >
      {children}
    </PvpContext.Provider>
  );
}
