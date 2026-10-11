import PokemonMoveExecutionDialog, {
  BattleResultView,
} from "./PokemonMoveExecutionDialog";
import { getCurrentHp } from "@/lib/pokemonStats";
import { useState } from "react";
import { Plus, RefreshCw, Swords } from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { learnInitialMove, learnPokemonMoveWithTm } from "@/slices/partySlice";
import { usePokemonMoveCatalog } from "@/hooks/usePokemonMoveCatalog";
import type { CapturedPokemon } from "@/types/pokemon";
import type { PokemonMove } from "@/types/moves";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PokemonTypeBadges from "./PokemonTypeBadges";

type Choice = { kind: "initial" } | { kind: "tm"; replaceMoveId?: number };
const TYPE_IDS: Record<string, number> = {
  normal: 1,
  fighting: 2,
  flying: 3,
  poison: 4,
  ground: 5,
  rock: 6,
  bug: 7,
  ghost: 8,
  steel: 9,
  fire: 10,
  water: 11,
  grass: 12,
  electric: 13,
  psychic: 14,
  ice: 15,
  dragon: 16,
  dark: 17,
  fairy: 18,
};
const TYPE_ICON_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet/small";

function MoveTypeIcon({ type }: { type: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      role="img"
      aria-label={`Type: ${type}`}
      title={type}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[9px] uppercase"
    >
      {TYPE_IDS[type] && !failed ? (
        <img
          src={`${TYPE_ICON_BASE}/${TYPE_IDS[type]}.png`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        type.slice(0, 2)
      )}
    </span>
  );
}
function MoveDetails({ move }: { move: PokemonMove }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <PokemonTypeBadges types={[move.type]} />
        <span className="text-xs capitalize text-muted-foreground">
          {move.damageClass}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Power</dt>
          <dd className="font-semibold">{move.power ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Accuracy</dt>
          <dd className="font-semibold">
            {move.accuracy === null ? "—" : `${move.accuracy}%`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">PP</dt>
          <dd className="font-semibold">{move.pp ?? "—"}</dd>
        </div>
      </dl>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {move.description}
      </p>
    </div>
  );
}

function MovePicker({
  capture,
  choice,
  onClose,
}: {
  capture: CapturedPokemon;
  choice: Choice;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cardConfirmed, setCardConfirmed] = useState(false);
  const { catalog, loading, error, failedCount, progress, retry } =
    usePokemonMoveCatalog(capture.captureId, capture.pokemon.id);
  const knownMoves = capture.moves ?? [];
  const replacingId = choice.kind === "tm" ? choice.replaceMoveId : undefined;
  const replacedMove = knownMoves.find((move) => move.id === replacingId);
  const move = catalog.find((move) => move.id === selectedId);
  const available = catalog.filter(
    (move) => !knownMoves.some((known) => known.id === move.id),
  );
  const term = search.trim().toLowerCase().replace(/-/g, " ");
  const filtered = available.filter((move) =>
    `${move.displayName} ${move.name.replace(/-/g, " ")}`
      .toLowerCase()
      .includes(term),
  );
  const isTm = choice.kind === "tm";
  const targetStillValid =
    replacingId === undefined ? knownMoves.length < 4 : !!replacedMove;

  function learn() {
    if (!move || !targetStillValid || (isTm && !cardConfirmed)) return;
    const before = store
      .getState()
      .party.pokemons.find((p) => p.captureId === capture.captureId);
    if (!before || before.moves?.some((m) => m.id === move.id)) return;
    if (choice.kind === "initial") {
      dispatch(learnInitialMove({ captureId: capture.captureId, move }));
    } else {
      dispatch(
        learnPokemonMoveWithTm({
          captureId: capture.captureId,
          move,
          replaceMoveId: choice.replaceMoveId,
        }),
      );
    }
    const after = store
      .getState()
      .party.pokemons.find((p) => p.captureId === capture.captureId);
    if (!after?.moves?.some((m) => m.id === move.id)) {
      toast.error(
        "No se pudo aprender el movimiento. Revisa la compatibilidad y los espacios disponibles.",
      );
      return;
    }
    toast.success(
      `${move.displayName} aprendido.`,
      isTm
        ? {
            description: replacedMove
              ? `Sustituyó a ${replacedMove.displayName}. Descarta la carta TM utilizada.`
              : "Descarta la carta TM utilizada.",
          }
        : undefined,
    );
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[520px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isTm
              ? replacedMove
                ? "Sustituir movimiento con TM"
                : "Aprender movimiento con TM"
              : "Elegir movimiento inicial"}
          </DialogTitle>
          <DialogDescription>
            {isTm
              ? replacedMove
                ? `Gasta una carta TM para reemplazar ${replacedMove.displayName} por otro movimiento compatible.`
                : "Gasta una carta TM para aprender un movimiento compatible en un espacio libre."
              : "Esta elección utiliza uno de los dos movimientos gratuitos de tu inicial. Cambiarlo después requiere una carta TM."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar movimiento en inglés…"
            aria-label="Buscar movimiento"
            autoComplete="off"
          />
          {loading && (
            <p role="status" className="text-xs text-muted-foreground">
              Cargando tipos y movimientos…{" "}
              {progress.total > 0 && `${progress.done}/${progress.total}`}
            </p>
          )}
          {(error || (!loading && failedCount > 0)) && (
            <div
              role="alert"
              className="space-y-2 text-xs text-muted-foreground"
            >
              <p>
                {error ||
                  `No se pudieron cargar ${failedCount} movimientos. Puedes elegir entre los disponibles o reintentar.`}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={retry}
              >
                Reintentar
              </Button>
            </div>
          )}
          <div
            role="group"
            aria-label="Movimientos compatibles"
            className="max-h-48 space-y-1 overflow-y-auto overscroll-contain rounded-xl border p-1"
          >
            {filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={selectedId === option.id}
                onClick={() => {
                  setSelectedId(option.id);
                  setCardConfirmed(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === option.id ? "bg-muted font-semibold text-brand" : "hover:bg-muted"}`}
              >
                <MoveTypeIcon type={option.type} />
                <span className="min-w-0 flex-1 break-words">
                  {option.displayName}
                </span>
                <span className="shrink-0 text-[10px] capitalize text-muted-foreground">
                  {option.damageClass}
                </span>
              </button>
            ))}
            {!filtered.length && (
              <p className="p-3 text-sm text-muted-foreground">
                {loading
                  ? "Preparando el catálogo…"
                  : "No hay movimientos nuevos que coincidan con tu búsqueda."}
              </p>
            )}
          </div>
          {move ? (
            <article className="space-y-3 rounded-xl border bg-muted/30 p-3">
              <h3 className="font-semibold">{move.displayName}</h3>
              <MoveDetails move={move} />
              {isTm && (
                <label className="flex cursor-pointer items-start gap-2 border-t pt-3 text-sm">
                  <input
                    type="checkbox"
                    checked={cardConfirmed}
                    onChange={(event) => setCardConfirmed(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-current"
                  />
                  <span>
                    Confirmo que gastaré una carta TM para{" "}
                    {replacedMove
                      ? `sustituir ${replacedMove.displayName} por ${move.displayName}`
                      : `aprender ${move.displayName}`}
                    .
                  </span>
                </label>
              )}
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecciona un movimiento para ver sus características.
            </p>
          )}
          {!targetStillValid && (
            <p role="alert" className="text-sm text-destructive">
              El espacio o movimiento de destino cambió. Cierra este selector y
              vuelve a abrirlo.
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!move || !targetStillValid || (isTm && !cardConfirmed)}
            onClick={learn}
          >
            {isTm
              ? replacedMove
                ? "Gastar 1 TM y sustituir"
                : "Gastar 1 TM y aprender"
              : "Aprender gratis"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PokemonMovesPanel({
  captureId,
}: {
  captureId: string;
}) {
  const capture = useAppSelector((state) =>
    state.party.pokemons.find((p) => p.captureId === captureId),
  );
  const [choice, setChoice] = useState<Choice | null>(null);
  const [executingMoveId, setExecutingMoveId] = useState<number | null>(null);
  const opponent = useAppSelector((state) => state.party.opponent);
  const lastResult = useAppSelector((state) => state.party.lastBattleResult);

  if (!capture) return null;
  const moves = capture.moves ?? [];
  const used = Math.max(
    capture.initialMovesChosen ?? 0,
    moves.filter((m) => m.source === "starter").length,
  );
  const freeSlots =
    capture.origin === "starter"
      ? Math.max(0, Math.min(2 - used, 4 - moves.length))
      : 0;

  return (
    <section
      aria-label="Movimientos"
      className="rounded-2xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Movimientos</h2>
        <span className="text-xs text-muted-foreground">{moves.length}/4</span>
      </div>
      {freeSlots > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Puedes elegir {freeSlots} movimiento{freeSlots === 1 ? "" : "s"}{" "}
          gratis para tu inicial.
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {moves.map((move) => (
          <article
            key={move.id}
            className="flex flex-col gap-3 rounded-xl border p-3"
          >
            <h3 className="font-semibold">{move.displayName}</h3>
            <MoveDetails move={move} />
            <Button
              type="button"
              size="sm"
              className="mt-auto w-full gap-2"
              disabled={
                !opponent ||
                getCurrentHp(capture.pokemon) <= 0 ||
                (opponent.kind === "wild" &&
                  getCurrentHp(opponent.pokemon) <= 0)
              }
              onClick={() => setExecutingMoveId(move.id)}
            >
              <Swords className="h-4 w-4 shrink-0" /> Usar movimiento
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-auto w-full gap-2"
              onClick={() => setChoice({ kind: "tm", replaceMoveId: move.id })}
              aria-label={`Sustituir ${move.displayName} con una TM`}
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" /> Sustituir con TM
            </Button>
          </article>
        ))}
        {Array.from({ length: Math.max(0, 4 - moves.length) }, (_, index) => (
          <Button
            key={`empty-${index}`}
            type="button"
            variant="outline"
            className="h-auto min-h-20 whitespace-normal border-dashed p-4"
            onClick={() =>
              setChoice(
                index < freeSlots ? { kind: "initial" } : { kind: "tm" },
              )
            }
          >
            <Plus className="mr-2 h-4 w-4 shrink-0" />{" "}
            {index < freeSlots ? "Elegir movimiento gratis" : "Aprender con TM"}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Aprender o sustituir con TM cuesta una carta física por movimiento. Los
        movimientos aprendidos se guardan en tu equipo.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {opponent
          ? "Cada confirmación ejecuta un nuevo movimiento. El último resultado queda guardado."
          : "Selecciona un oponente para usar tus movimientos."}
      </p>
      {lastResult?.captureId === captureId && (
        <details className="mt-3 rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Último resultado · {lastResult.moveName}
          </summary>
          <div className="mt-3">
            <BattleResultView result={lastResult} />
          </div>
        </details>
      )}
      {executingMoveId !== null && (
        <PokemonMoveExecutionDialog
          key={`${captureId}-${executingMoveId}`}
          captureId={captureId}
          moveId={executingMoveId}
          onClose={() => setExecutingMoveId(null)}
        />
      )}
      {choice && (
        <MovePicker
          key={`${captureId}-${choice.kind}-${choice.kind === "tm" ? (choice.replaceMoveId ?? "new") : "free"}`}
          capture={capture}
          choice={choice}
          onClose={() => setChoice(null)}
        />
      )}
    </section>
  );
}
