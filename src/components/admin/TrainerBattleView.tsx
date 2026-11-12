import { useEffect, useRef, useState } from "react";
import { History, Settings2, Swords } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import PokemonTypeBadges from "@/components/pokemon/PokemonTypeBadges";
import BattleTurnHighlightsDialog from "@/components/pokemon/BattleTurnHighlightsDialog";
import TrainerBattleArena from "./TrainerBattleArena";
import TrainerPpItems from "./TrainerPpItems";
import type { ConsumableItemId } from "@/lib/shop/types";
import {
  chooseTrainerAction,
  cancelTrainerAction,
} from "@/lib/trainerBattle/engine";
import { getCurrentHp, getMaxHp, STAT_LABELS } from "@/lib/pokemonStats";
import {
  getEffectiveBattleStats,
  normalizeStages,
} from "@/lib/battleModifiers";
import { STATUS_OPTIONS, type CapturedPokemon } from "@/types/pokemon";
import type {
  TrainerBattleSession,
  TrainerChoice,
  TrainerSide,
  TrainerTurnSummary,
} from "@/lib/trainerBattle/types";

type Props = {
  session: TrainerBattleSession;
  onChange: (next: TrainerBattleSession) => void;
  onEditSetup: () => void;
  onAction?: (
    side: TrainerSide,
    choice: TrainerChoice | "cancel",
  ) => void | Promise<void>;
  disabled?: boolean;
  allowItems?: boolean;
  itemStock?: Partial<Record<TrainerSide, number>>;
  consumableStock?: Partial<
    Record<TrainerSide, Partial<Record<ConsumableItemId, number>>>
  >;
  allowForfeit?: boolean;
  automaticSide?: TrainerSide;
  onExit?: () => void | Promise<void>;
};

function CombatDetails({ capture }: { capture: CapturedPokemon }) {
  const effective = getEffectiveBattleStats(capture.pokemon);
  const stages = normalizeStages(capture.pokemon.battleStages);
  const statuses = STATUS_OPTIONS.filter((status) =>
    capture.statuses?.includes(status.id),
  );
  return (
    <details className="rounded-lg border p-3 text-xs">
      <summary className="cursor-pointer font-medium">
        Estados y stats de combate
      </summary>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {statuses.length ? (
          statuses.map((status) => {
            const turns =
              capture.statusTurns?.[
                status.id as keyof typeof capture.statusTurns
              ];
            return (
              <span
                key={status.id}
                className="rounded-md bg-muted px-2 py-1"
                title={status.rule}
              >
                {status.icon} {status.label}
                {turns ? ` · ${turns}` : ""}
              </span>
            );
          })
        ) : (
          <p className="text-muted-foreground">Sin estados negativos.</p>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {Object.entries(stages).map(([stat, stage]) => (
          <div key={stat} className="flex min-w-0 justify-between gap-1">
            <dt>
              {STAT_LABELS[stat] ??
                (stat === "evasiveness"
                  ? "Evasión"
                  : stat === "accuracy"
                    ? "Precisión"
                    : stat)}
            </dt>
            <dd className="shrink-0 font-semibold tabular-nums">
              {effective[stat as keyof typeof effective] ?? ""}
              <span className="ml-1 font-normal text-muted-foreground">
                ({stage > 0 ? "+" : ""}
                {stage})
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function TrainerControls({
  session,
  side,
  disabled,
  onChoose,
  onCancel,
  allowItems,
  itemStock,
  consumableStock,
  allowForfeit,
}: {
  session: TrainerBattleSession;
  side: TrainerSide;
  disabled: boolean;
  onChoose: (side: TrainerSide, choice: TrainerChoice) => void;
  onCancel: (side: TrainerSide) => void;
  allowItems: boolean;
  itemStock?: number;
  consumableStock?: Partial<Record<ConsumableItemId, number>>;
  allowForfeit: boolean;
}) {
  const [choosingRestore, setChoosingRestore] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const team = session.teams[side];
  const runtime = session.runtime!;
  const request = runtime.requests[side];
  const pending = runtime.pending[side];
  const active = team.pokemons.find(
    (capture) => capture.captureId === team.activeCaptureId,
  );
  const finished = session.phase === "finished" || runtime.ended;
  const canChoose = !disabled && !finished && !pending && !request.waiting;
  const canSwitch =
    canChoose && (request.forceSwitch || (!request.trapped && !request.locked));
  const canUseItem =
    allowItems &&
    canChoose &&
    !request.forceSwitch &&
    !request.locked &&
    (itemStock === undefined || itemStock > 0);
  function chooseAction(choice: TrainerChoice) {
    setChoosingRestore(false);
    onChoose(side, choice);
  }
  const living = team.pokemons.filter(
    (capture) => getCurrentHp(capture.pokemon) > 0,
  ).length;
  const status = finished
    ? "Combate terminado"
    : pending
      ? "Acción elegida · esperando al otro lado"
      : request.waiting
        ? "Esperando el reemplazo del otro equipo"
        : request.forceSwitch
          ? "Elige un Pokémon para reemplazar al debilitado"
          : request.locked
            ? "Continuación obligatoria del movimiento"
            : "Elige un movimiento, usa un objeto o cambia de Pokémon";

  return (
    <section
      className="min-w-0 space-y-3 rounded-2xl border bg-card p-3 text-card-foreground sm:p-4"
      aria-label={`Controles de ${team.name}`}
    >
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-lg font-bold">
            {side.toUpperCase()} · {team.name}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {living}/{team.pokemons.length} en pie
          </span>
        </div>
        {active && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold capitalize">{active.pokemon.name}</p>
            <PokemonTypeBadges types={active.pokemon.types} />
          </div>
        )}
        <p
          role="status"
          className={`text-sm ${request.forceSwitch && !finished ? "font-semibold text-destructive" : "text-muted-foreground"}`}
        >
          {status}
        </p>
      </header>

      {pending && !finished ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full"
          disabled={disabled}
          onClick={() => onCancel(side)}
        >
          Cancelar elección
        </Button>
      ) : !finished && !request.waiting && !request.forceSwitch ? (
        <>
          <details open className="rounded-xl border p-3">
            <summary className="cursor-pointer select-none font-semibold">
              Battle moves
            </summary>
            <div className="pt-3">
              <div
                className="grid grid-cols-2 gap-2"
                aria-label={`Movimientos de ${team.name}`}
              >
                {request.moves.map((move) => {
                  const data = active?.moves?.find(
                    (candidate) => candidate.id === move.id,
                  );
                  return (
                    <Button
                      key={move.id}
                      data-move-id={move.id}
                      type="button"
                      variant="outline"
                      className="h-auto min-h-16 min-w-0 flex-col items-start whitespace-normal px-3 py-2 text-left"
                      disabled={!canChoose || move.disabled}
                      onClick={() =>
                        chooseAction({ kind: "move", moveId: move.id })
                      }
                    >
                      <span className="break-words font-semibold">
                        {move.name}
                      </span>
                      <span className="mt-1 text-xs font-normal text-muted-foreground">
                        {move.pp}/{move.maxpp} PP{data ? ` · ${data.type}` : ""}
                      </span>
                      {move.disabled && (
                        <span className="text-[10px] text-muted-foreground">
                          No disponible
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>
            </div>
          </details>

          {allowItems && (
            <details
              className="rounded-xl border p-3"
              data-testid={`trainer-items-${side}`}
            >
              <summary className="cursor-pointer select-none font-semibold">
                Items
              </summary>
              <div className="pt-3">
                <div
                  className="space-y-2"
                  aria-label={`Objetos de ${team.name}`}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full gap-2"
                    disabled={!canUseItem}
                    aria-expanded={choosingRestore}
                    aria-controls={`full-restore-targets-${side}`}
                    onClick={() => setChoosingRestore((open) => !open)}
                  >
                    <img
                      src="/admin-shop/full-restore.png"
                      alt=""
                      className="h-6 w-6 object-contain [image-rendering:pixelated]"
                    />
                    Full Restore
                    {itemStock !== undefined ? ` · ${itemStock}` : ""}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {itemStock === 0
                      ? "Este jugador no tiene Full Restore en su Bag."
                      : request.locked
                        ? "Completa la acción obligatoria antes de usar un objeto."
                        : "Recupera todo el HP, cura los estados negativos y restablece los modificadores a 0. Consume tu acción del turno."}
                  </p>
                  {choosingRestore && (
                    <div
                      id={`full-restore-targets-${side}`}
                      className="space-y-2"
                    >
                      <p className="text-sm font-medium">
                        Elige el Pokémon que recibirá Full restore
                      </p>
                      <div
                        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                        aria-label={`Objetivos de Full restore de ${team.name}`}
                      >
                        {team.pokemons.map((capture) => (
                          <Button
                            key={capture.captureId}
                            type="button"
                            variant="outline"
                            className="h-auto min-h-16 min-w-0 flex-col whitespace-normal px-2 py-2"
                            disabled={!canUseItem}
                            aria-label={`Usar Full restore en ${capture.pokemon.name}`}
                            onClick={() =>
                              chooseAction({
                                kind: "item",
                                item: "full-restore",
                                captureId: capture.captureId,
                              })
                            }
                          >
                            <span className="break-words text-xs font-semibold capitalize">
                              {capture.pokemon.name}
                            </span>
                            <span className="mt-1 text-[10px] font-normal tabular-nums text-muted-foreground">
                              {getCurrentHp(capture.pokemon)}/
                              {getMaxHp(capture.pokemon) ?? "—"} HP
                            </span>
                          </Button>
                        ))}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-h-10 w-full"
                        onClick={() => setChoosingRestore(false)}
                      >
                        Volver a las acciones
                      </Button>
                    </div>
                  )}
                  <TrainerPpItems
                    team={team}
                    stock={consumableStock}
                    disabled={
                      !canChoose || request.forceSwitch || request.locked
                    }
                    onChoose={chooseAction}
                  />
                </div>
              </div>
            </details>
          )}
        </>
      ) : null}

      {(!pending || finished) && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">
            Equipo ·{" "}
            {request.forceSwitch && !finished
              ? "reemplazo obligatorio"
              : "cambiar Pokémon"}
          </h4>
          <div className="grid grid-cols-3 gap-1.5">
            {team.pokemons.map((capture) => {
              const selected = capture.captureId === team.activeCaptureId;
              const fainted = getCurrentHp(capture.pokemon) <= 0;
              return (
                <Button
                  key={capture.captureId}
                  type="button"
                  variant={selected ? "secondary" : "outline"}
                  className="h-auto min-h-16 min-w-0 flex-col whitespace-normal px-1.5 py-2 text-center"
                  disabled={!canSwitch || selected || fainted}
                  onClick={() =>
                    chooseAction({
                      kind: "switch",
                      captureId: capture.captureId,
                    })
                  }
                  aria-label={`${selected ? "En campo" : fainted ? "Debilitado" : "Cambiar a"}: ${capture.pokemon.name}`}
                >
                  <span className="break-words text-xs font-semibold capitalize">
                    {capture.pokemon.name}
                  </span>
                  <span className="mt-1 text-[10px] font-normal tabular-nums text-muted-foreground">
                    {fainted
                      ? "Debilitado"
                      : `${getCurrentHp(capture.pokemon)}/${getMaxHp(capture.pokemon) ?? "—"} HP`}
                  </span>
                  {selected && (
                    <span className="text-[10px] font-normal">En campo</span>
                  )}
                </Button>
              );
            })}
          </div>
          {request.trapped && !request.forceSwitch && !finished && (
            <p className="text-xs text-muted-foreground">
              Este Pokémon no puede retirarse mientras siga atrapado.
            </p>
          )}
        </div>
      )}
      {allowForfeit && !finished && (
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 w-full"
          disabled={!canChoose}
          onClick={() => setConfirmForfeit(true)}
        >
          Rendirse: {team.name}
        </Button>
      )}
      <Dialog
        open={confirmForfeit && !finished}
        onOpenChange={setConfirmForfeit}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rendición de {team.name}</DialogTitle>
            <DialogDescription>
              El otro equipo ganará y se conservarán los HP y estados actuales.
              Esta acción termina el combate.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmForfeit(false)}>
              Seguir combatiendo
            </Button>
            <Button
              variant="destructive"
              disabled={!canChoose}
              onClick={() => {
                setConfirmForfeit(false);
                chooseAction({ kind: "forfeit" });
              }}
            >
              Confirmar rendición
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {(!pending || finished) && active && <CombatDetails capture={active} />}
    </section>
  );
}

export default function TrainerBattleView({
  session,
  onChange,
  onEditSetup,
  onAction,
  disabled = false,
  allowItems = true,
  itemStock,
  consumableStock,
  allowForfeit = false,
  automaticSide,
  onExit,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const [summary, setSummary] = useState<TrainerTurnSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const arenaRef = useRef<HTMLDivElement>(null);
  const runtime = session.runtime;
  const previousSummary = useRef(session.history[0]?.id);
  useEffect(() => {
    const latest = session.history[0];
    if (onAction && latest?.completed && latest.id !== previousSummary.current)
      setSummary(latest);
    previousSummary.current = latest?.id;
  }, [session.history, onAction]);

  function returnToArena() {
    arenaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    arenaRef.current?.focus({ preventScroll: true });
  }
  async function act(side: TrainerSide, choice: TrainerChoice | "cancel") {
    if (actionLock.current || disabled || side === automaticSide) return;
    actionLock.current = true;
    setBusy(true);
    try {
      if (onAction) {
        await onAction(side, choice);
        return;
      }
      const next =
        choice === "cancel"
          ? cancelTrainerAction(session, side)
          : chooseTrainerAction(session, side, choice);
      onChange(next);
      const previousIds = new Set(session.history.map((entry) => entry.id));
      const completed = next.history.find(
        (entry) => entry.completed && !previousIds.has(entry.id),
      );
      if (completed) setSummary(completed);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo aplicar la acción del combate.",
      );
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  if (!runtime)
    return (
      <p role="status">Selecciona ambos equipos para comenzar el combate.</p>
    );
  const finished = session.phase === "finished" || runtime.ended;
  const winner = runtime.winner;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Swords className="h-5 w-5 shrink-0 text-brand" /> Combate de
            entrenadores
          </h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {session.teams.a.name} contra {session.teams.b.name}
          </p>
        </div>
        {(!onAction || (finished && onExit)) && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 gap-2"
            onClick={onAction ? () => void onExit?.() : onEditSetup}
            disabled={busy || disabled}
          >
            <Settings2 className="h-4 w-4" />{" "}
            {onAction
              ? "Salir y actualizar Partys"
              : finished
                ? "Volver a configuración"
                : "Configuración"}
          </Button>
        )}
      </header>
      {finished && (
        <div
          role="status"
          className="rounded-2xl border border-brand bg-muted p-4 text-center"
        >
          <h3 className="text-xl font-bold">
            {winner === "draw"
              ? "¡Empate!"
              : winner
                ? `¡Victoria de ${session.teams[winner].name}!`
                : "Combate terminado"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Puedes consultar el resultado y los turnos en el historial.
          </p>
        </div>
      )}
      <div
        ref={arenaRef}
        tabIndex={-1}
        className="scroll-mt-4 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TrainerBattleArena
          session={session}
          flipped={flipped}
          onTogglePerspective={() => setFlipped((current) => !current)}
        />
      </div>
      {!finished && (
        <p className="text-sm text-muted-foreground">
          {automaticSide
            ? "Elige la acción del jugador. El NPC responde automáticamente; el turno se resuelve por prioridad y velocidad."
            : "Cada entrenador elige su acción. Al confirmar ambas, se resuelven por prioridad y velocidad. Puedes cancelar una elección mientras espera."}
        </p>
      )}
      <div className="grid items-start gap-3 md:grid-cols-2">
        {(["a", "b"] as const).map((side) =>
          side === automaticSide ? (
            <section
              key={side}
              aria-label={`NPC ${session.teams[side].name}`}
              className="space-y-3 rounded-2xl border bg-card p-4"
            >
              <h3 className="text-lg font-bold">
                {side.toUpperCase()} · {session.teams[side].name}
              </h3>
              <p role="status" className="text-sm text-muted-foreground">
                {finished
                  ? "Combate terminado"
                  : disabled
                    ? "Esperando confirmación o conexión para continuar."
                    : runtime.pending[side]
                      ? "El NPC ya eligió su acción."
                      : "El NPC elige sus movimientos y cambios automáticamente."}
              </p>
              <ul className="space-y-2 text-sm">
                {session.teams[side].pokemons.map((capture) => (
                  <li
                    key={capture.captureId}
                    className="flex flex-wrap justify-between gap-2 rounded-lg border p-2"
                  >
                    <span className="capitalize">
                      {capture.pokemon.name} · Nv. {capture.pokemon.level}
                      {capture.captureId === session.teams[side].activeCaptureId
                        ? " · En campo"
                        : ""}
                    </span>
                    <span>
                      {getCurrentHp(capture.pokemon)}/
                      {getMaxHp(capture.pokemon)} HP
                    </span>
                  </li>
                ))}
              </ul>
              {session.teams[side].pokemons
                .filter(
                  (capture) =>
                    capture.captureId === session.teams[side].activeCaptureId,
                )
                .map((capture) => (
                  <CombatDetails key={capture.captureId} capture={capture} />
                ))}
            </section>
          ) : (
            <TrainerControls
              key={side}
              session={session}
              side={side}
              disabled={busy || disabled}
              allowItems={allowItems}
              itemStock={itemStock?.[side]}
              consumableStock={consumableStock?.[side]}
              allowForfeit={allowForfeit}
              onChoose={act}
              onCancel={(target) => act(target, "cancel")}
            />
          ),
        )}
      </div>
      <section
        className="rounded-2xl border bg-card p-4 text-card-foreground"
        aria-label="Historial del combate"
      >
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <History className="h-4 w-4" /> Historial · {session.history.length}{" "}
          resoluciones
        </h3>
        {session.history.length ? (
          <div className="max-h-96 space-y-2 overflow-y-auto overscroll-contain">
            {session.history.map((entry) => (
              <details key={entry.id} className="rounded-xl border p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Turno {entry.turn}
                  {entry.completed ? " · Resuelto" : " · Acción"}
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {entry.events.map((event, index) => (
                    <li key={index}>{event}</li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 min-h-10"
                  onClick={() => setSummary(entry)}
                >
                  Ver resumen
                </Button>
              </details>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aquí aparecerá el resultado de cada turno.
          </p>
        )}
      </section>
      <BattleTurnHighlightsDialog
        batch={summary}
        onClose={() => setSummary(null)}
        onReturnToArena={returnToArena}
        sideLabels={{
          player: session.teams.a.name,
          opponent: session.teams.b.name,
        }}
      />
    </div>
  );
}
