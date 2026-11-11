import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import TrainerBattleView from "./TrainerBattleView";
import { usePvpContext } from "@/context/PvpContext";
import { startTrainerBattle } from "@/lib/trainerBattle/engine";
import { validTrainerBattleSession } from "@/lib/trainerBattle/model";
import type { TrainerChoice, TrainerSide } from "@/lib/trainerBattle/types";
import {
  applyPvpTrainerCommands,
  clearPvpCheckpointOutbox,
  createPvpTrainerSession,
  readPvpCheckpointOutbox,
  writePvpCheckpointOutbox,
  type PvpCheckpointOutbox,
} from "@/lib/pvp/battleAdapter";
import { stablePvpJson, type PvpBattleView } from "@/lib/pvp/types";

const failureText = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error &&
          typeof error === "object" &&
          "message" in error &&
          typeof error.message === "string"
        ? error.message
        : "No se pudo completar la operación PvP. Actualiza la conexión.";

const INCOMPLETE_CHECKPOINT_MESSAGE =
  "El estado del combate está incompleto o es incompatible. Actualiza la conexión para recuperarlo. Los equipos siguen reservados.";

function hasCompleteCheckpoint(view: PvpBattleView): boolean {
  const requiresSession = ["active", "finished", "finalizing"].includes(
    view.phase,
  );
  if (!view.session) return !requiresSession;
  try {
    if (
      !validTrainerBattleSession(view.session) ||
      view.session.id !== view.battleId ||
      view.session.networkBattleId !== view.battleId
    )
      return false;
    if (view.phase === "active" && view.session.phase !== "battle")
      return false;
    if (
      ["finished", "finalizing"].includes(view.phase) &&
      view.session.phase !== "finished"
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

export default function PvpBattlePanel() {
  const pvp = usePvpContext();
  const contextRef = useRef(pvp);
  contextRef.current = pvp;
  const workRef = useRef(false);
  const attemptedRef = useRef("");
  const [working, setWorking] = useState(false);
  const [localError, setLocalError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  const state = pvp.state;
  const incompleteCheckpoint = useMemo(
    () => !!state && !hasCompleteCheckpoint(state),
    [state?.session, state?.phase, state?.battleId],
  );
  const ownerId = pvp.user?.id ?? 0;
  const ownHost =
    !!state &&
    state.host.userId === ownerId &&
    state.host.clientId === pvp.clientId;
  const ownersOnline =
    !!state && state.players.a.online && state.players.b.online;
  const locked = working || pvp.busy;
  const readyConnection = pvp.connected && pvp.synced;
  const terminal = state?.phase === "cancelled" || state?.phase === "finalized";
  const players = Array.from(
    new Map(
      pvp.lobby
        .filter((player) => player.online && !player.busy)
        .map((player) => [player.user.id, player]),
    ).values(),
  );

  async function run(operation: () => Promise<unknown>): Promise<void> {
    if (workRef.current) return;
    workRef.current = true;
    setWorking(true);
    setLocalError("");
    try {
      await operation();
    } catch (error) {
      setLocalError(failureText(error));
    } finally {
      workRef.current = false;
      setWorking(false);
    }
  }

  function requireHost(view: PvpBattleView, requirePlayers = true): void {
    const current = contextRef.current;
    if (!hasCompleteCheckpoint(view))
      throw new Error(INCOMPLETE_CHECKPOINT_MESSAGE);
    if (
      !current.connected ||
      !current.synced ||
      view.host.userId !== current.user?.id ||
      view.host.clientId !== current.clientId ||
      !view.host.online
    )
      throw new Error(
        "Esta pestaña debe estar conectada y tener el control del combate.",
      );
    if (requirePlayers && (!view.players.a.online || !view.players.b.online))
      throw new Error(
        "El combate está en pausa hasta que regresen ambos jugadores.",
      );
  }

  async function publish(entry: PvpCheckpointOutbox): Promise<void> {
    const current = contextRef.current;
    const view = current.state;
    if (
      !view ||
      view.battleId !== entry.battleId ||
      view.host.epoch !== entry.hostEpoch
    )
      throw new Error(
        "El control de la batalla cambió. Recupera el estado confirmado.",
      );
    requireHost(view);
    // Durable local proposal precedes any network acknowledgement. Only the
    // server's accepted checkpoint is rendered, never this speculative copy.
    writePvpCheckpointOutbox(localStorage, entry);
    const accepted = await current.publishCheckpoint(
      entry.session,
      entry.processedCommandIds,
      entry.expectedCheckpointRevision,
    );
    if (
      !accepted ||
      !hasCompleteCheckpoint(accepted) ||
      accepted.checkpointRevision <= entry.expectedCheckpointRevision ||
      stablePvpJson(accepted.session) !== stablePvpJson(entry.session)
    )
      throw new Error(
        "La transición sigue pendiente de confirmación. Actualiza para recuperarla.",
      );
    contextRef.current = { ...contextRef.current, state: accepted };
    clearPvpCheckpointOutbox(
      localStorage,
      entry.battleId,
      entry.adminUserId,
      entry.clientId,
    );
  }

  function prepared(
    view: PvpBattleView,
    session: NonNullable<PvpBattleView["session"]>,
    processedCommandIds: string[],
  ): PvpCheckpointOutbox {
    return {
      version: 1,
      battleId: view.battleId,
      adminUserId: ownerId,
      clientId: pvp.clientId,
      hostEpoch: view.host.epoch,
      expectedCheckpointRevision: view.checkpointRevision,
      session,
      processedCommandIds,
    };
  }

  useEffect(() => {
    if (incompleteCheckpoint) {
      attemptedRef.current = "";
      return;
    }
    if (!pvp.connected || !pvp.synced) {
      attemptedRef.current = "";
      return;
    }
    if (!ownersOnline || !ownHost || !state?.host.online) {
      attemptedRef.current = "";
      return;
    }
    if (
      !state ||
      !ownHost ||
      !ownersOnline ||
      !state.host.online ||
      locked ||
      terminal ||
      state.phase === "finalizing"
    )
      return;
    const signature = `${state.battleId}:${state.revision}:${state.checkpointRevision}:${state.host.epoch}:${retryCount}`;
    if (attemptedRef.current === signature) return;
    attemptedRef.current = signature;
    let proposal: PvpCheckpointOutbox | null;
    try {
      proposal = readPvpCheckpointOutbox(
        localStorage,
        state.battleId,
        ownerId,
        pvp.clientId,
      );
      if (
        proposal &&
        (proposal.hostEpoch !== state.host.epoch ||
          proposal.expectedCheckpointRevision < state.checkpointRevision)
      ) {
        // A newer server checkpoint (including a lost successful ACK) wins.
        clearPvpCheckpointOutbox(
          localStorage,
          state.battleId,
          ownerId,
          pvp.clientId,
        );
        proposal = null;
      }
    } catch (error) {
      setLocalError(failureText(error));
      return;
    }
    if (proposal) {
      void run(() => publish(proposal));
      return;
    }
    if (state.phase !== "active" || !state.session || !state.commands?.length)
      return;
    void run(async () => {
      const current = contextRef.current.state;
      if (!current?.session)
        throw new Error("Falta el estado confirmado del combate.");
      requireHost(current);
      const result = applyPvpTrainerCommands(
        current.session,
        current.commands ?? [],
      );
      await publish(
        prepared(current, result.session, result.processedCommandIds),
      );
    });
  }, [
    state,
    ownHost,
    ownersOnline,
    locked,
    terminal,
    retryCount,
    ownerId,
    pvp.clientId,
    pvp.connected,
    pvp.synced,
    incompleteCheckpoint,
  ]);

  async function start(): Promise<void> {
    await run(async () => {
      const view = contextRef.current.state;
      if (!view) return;
      requireHost(view);
      const existing = readPvpCheckpointOutbox(
        localStorage,
        view.battleId,
        ownerId,
        pvp.clientId,
      );
      if (
        existing &&
        existing.hostEpoch === view.host.epoch &&
        existing.expectedCheckpointRevision === view.checkpointRevision
      ) {
        await publish(existing);
        return;
      }
      const seed = Array.from(crypto.getRandomValues(new Uint16Array(4))) as [
        number,
        number,
        number,
        number,
      ];
      const session = startTrainerBattle(createPvpTrainerSession(view), seed);
      await publish(prepared(view, session, []));
    });
  }

  async function action(
    side: TrainerSide,
    choice: TrainerChoice | "cancel",
  ): Promise<void> {
    if (choice !== "cancel" && choice.kind === "item")
      throw new Error("Los objetos del modo manual no se usan en PvP.");
    const view = contextRef.current.state;
    if (!view || workRef.current) return;
    requireHost(view);
    await contextRef.current.sendCommand(
      side,
      choice === "cancel" ? { kind: "cancel" } : choice,
    );
  }

  return (
    <section className="space-y-5" aria-label="Batallas PvP conectadas">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Swords className="h-5 w-5" /> Batalla PvP
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recibe los equipos de los jugadores y controla ambos lados desde
            este panel.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={locked || !pvp.connected}
          onClick={() =>
            void run(async () => {
              await pvp.sync();
              setRetryCount((value) => value + 1);
            })
          }
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Actualizar conexión
        </Button>
      </header>
      {!readyConnection && (
        <p role="status" className="rounded-xl border p-4">
          Esperando conexión y recuperación del combate con Nest.
        </p>
      )}
      {(localError || pvp.error) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive"
        >
          {localError || failureText(pvp.error)}
        </p>
      )}
      {incompleteCheckpoint && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive"
        >
          {INCOMPLETE_CHECKPOINT_MESSAGE}
        </p>
      )}
      {(!state || terminal) && (
        <div className="space-y-4 rounded-xl border bg-card p-4">
          {terminal && (
            <p role="status">
              {state.phase === "finalized"
                ? "Ambos jugadores guardaron sus resultados. Ya puedes preparar otra batalla."
                : "La preparación se canceló y los equipos quedaron liberados."}
            </p>
          )}
          <h3 className="font-semibold">
            Selecciona dos jugadores disponibles
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["a", "b"] as const).map((side) => (
              <label key={side} className="space-y-1 text-sm">
                <span className="block">Jugador {side.toUpperCase()}</span>
                <select
                  aria-label={`Jugador PvP ${side.toUpperCase()}`}
                  className="min-h-11 w-full rounded-md border bg-background px-3"
                  value={side === "a" ? playerA : playerB}
                  disabled={locked || !readyConnection}
                  onChange={(event) =>
                    side === "a"
                      ? setPlayerA(event.target.value)
                      : setPlayerB(event.target.value)
                  }
                >
                  <option value="">Selecciona un jugador conectado</option>
                  {players.map((player) => (
                    <option key={player.user.id} value={player.user.id}>
                      {player.user.first_name} · {player.user.email}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <Button
            disabled={
              locked ||
              !readyConnection ||
              !playerA ||
              !playerB ||
              playerA === playerB
            }
            onClick={() =>
              void run(() => pvp.createBattle(Number(playerA), Number(playerB)))
            }
          >
            Solicitar ambos equipos
          </Button>
        </div>
      )}
      {state && !terminal && (
        <>
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <h3 className="font-semibold">
              {state.players.a.user.first_name} contra{" "}
              {state.players.b.user.first_name}
            </h3>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {(["a", "b"] as const).map((side) => (
                <p key={side}>
                  {side.toUpperCase()} · {state.players[side].user.email} ·{" "}
                  {state.players[side].online ? "conectado" : "desconectado"}
                  {state.players[side].snapshot
                    ? ` · ${state.players[side].snapshot.pokemons.length} Pokémon recibidos`
                    : " · esperando equipo"}
                </p>
              ))}
            </div>
            {!ownHost && (
              <div className="space-y-2">
                <p role="status" className="text-sm">
                  Esta batalla está controlada desde otra pestaña. Recupera el
                  control aquí para continuar.
                </p>
                <Button
                  disabled={locked || !readyConnection}
                  onClick={() => void run(() => pvp.claimBattle())}
                >
                  Usar esta pestaña como anfitriona
                </Button>
              </div>
            )}
            {ownHost && !ownersOnline && (
              <p role="status" className="text-sm font-medium">
                Combate en pausa: espera a que regresen ambos jugadores. Sus
                equipos permanecen reservados.
              </p>
            )}
            {working && (
              <p role="status" className="text-sm">
                Guardando y confirmando la transición…
              </p>
            )}
            {(state.phase === "collecting" || state.phase === "ready") && (
              <div className="flex flex-wrap gap-2">
                {state.phase === "ready" && (
                  <Button
                    disabled={
                      locked ||
                      !readyConnection ||
                      !ownHost ||
                      !ownersOnline ||
                      incompleteCheckpoint
                    }
                    onClick={() => void start()}
                  >
                    Iniciar batalla PvP
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={
                    locked ||
                    !readyConnection ||
                    !ownHost ||
                    incompleteCheckpoint
                  }
                  onClick={() => void run(() => pvp.cancelBattle())}
                >
                  Cancelar preparación
                </Button>
              </div>
            )}
          </div>
          {state.session && !incompleteCheckpoint && (
            <TrainerBattleView
              session={state.session}
              onChange={() => {}}
              onEditSetup={() => {}}
              onAction={action}
              allowItems={false}
              allowForfeit
              disabled={
                locked ||
                !readyConnection ||
                !ownHost ||
                !ownersOnline ||
                state.phase !== "active" ||
                !!state.commands?.length
              }
            />
          )}
          {state.phase === "finished" && (
            <div className="space-y-2 rounded-xl border p-4">
              <p className="text-sm">
                El combate terminó. Los resultados se aplicarán a cada equipo al
                confirmar la salida.
              </p>
              <Button
                disabled={
                  locked || !readyConnection || !ownHost || incompleteCheckpoint
                }
                onClick={() => void run(() => pvp.finalizeBattle())}
              >
                Salir y actualizar Partys
              </Button>
            </div>
          )}
          {state.phase === "finalizing" && (
            <div role="status" className="space-y-2 rounded-xl border p-4">
              <p className="font-semibold">
                Esperando el guardado de ambos equipos
              </p>
              <p className="text-sm">
                A: {state.applied.a ? "guardado" : "pendiente"} · B:{" "}
                {state.applied.b ? "guardado" : "pendiente"}
              </p>
              <p className="text-sm text-muted-foreground">
                Los jugadores siguen reservados hasta que ambos confirmen el
                guardado. Puedes actualizar la conexión para recuperar el
                estado.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
