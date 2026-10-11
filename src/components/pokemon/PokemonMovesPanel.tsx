import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { useGetMoveQuery } from "@/api/pokeApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { learnInitialMove } from "@/slices/partySlice";
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
  onClose,
}: {
  capture: CapturedPokemon;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const {
    currentData: move,
    isFetching,
    isError,
    refetch,
  } = useGetMoveQuery(selectedId ?? 0, { skip: selectedId === null });
  const knownMoves = capture.moves ?? [];
  const choices = (capture.pokemon.learnset?.moves ?? []).filter(
    (option) => !knownMoves.some((m) => m.id === option.id),
  );
  const normalizedSearch = search.trim().toLowerCase().replace(/\s+/g, "-");
  const filtered = choices.filter((option) =>
    option.name.includes(normalizedSearch),
  );

  function learn() {
    if (!move || isFetching || move.id !== selectedId) return;
    const before = store
      .getState()
      .party.pokemons.find((p) => p.captureId === capture.captureId);
    if (!before || before.moves?.some((m) => m.id === move.id)) return;
    dispatch(learnInitialMove({ captureId: capture.captureId, move }));
    const after = store
      .getState()
      .party.pokemons.find((p) => p.captureId === capture.captureId);
    if (!after?.moves?.some((m) => m.id === move.id)) {
      toast.error(
        "No se puede aprender ese movimiento. Revisa los espacios disponibles.",
      );
      return;
    }
    toast.success(`${move.displayName} aprendido.`);
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
          <DialogTitle>Aprender un movimiento</DialogTitle>
          <DialogDescription>
            Elige con cuidado: cada elección ocupa uno de los dos movimientos
            gratuitos. Los cambios posteriores requerirán una TM/HM.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar movimiento en inglés…"
            aria-label="Buscar movimiento"
            autoComplete="off"
          />
          <div
            className="max-h-44 space-y-1 overflow-y-auto overscroll-contain rounded-xl border p-1"
            role="group"
            aria-label="Movimientos compatibles"
          >
            {filtered.map((option) => (
              <button
                type="button"
                key={option.id}
                aria-pressed={selectedId === option.id}
                onClick={() => setSelectedId(option.id)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === option.id ? "bg-muted font-semibold text-brand" : "hover:bg-muted"}`}
              >
                {option.name.replace(/-/g, " ")}
              </button>
            ))}
            {!filtered.length && (
              <p className="p-3 text-sm text-muted-foreground">
                No hay movimientos que coincidan.
              </p>
            )}
          </div>
          {isFetching ? (
            <p role="status" className="text-sm text-muted-foreground">
              Consultando movimiento…
            </p>
          ) : isError ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>No se pudo consultar el movimiento.</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refetch()}
              >
                Reintentar
              </Button>
            </div>
          ) : move && move.id === selectedId ? (
            <article className="space-y-3 rounded-xl border bg-muted/30 p-3">
              <h3 className="font-semibold">{move.displayName}</h3>
              <MoveDetails move={move} />
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">
              Selecciona un movimiento para ver sus características.
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t pt-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!move || move.id !== selectedId || isFetching || isError}
            onClick={learn}
          >
            Aprender movimiento
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
  const [pickerOpen, setPickerOpen] = useState(false);
  if (!capture) return null;
  const moves = capture.moves ?? [];
  const starterChoicesUsed = Math.max(
    capture.initialMovesChosen ?? 0,
    moves.filter((m) => m.source === "starter").length,
  );
  const freeSlots =
    capture.origin === "starter"
      ? Math.max(0, Math.min(2 - starterChoicesUsed, 4 - moves.length))
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
          <article key={move.id} className="space-y-2 rounded-xl border p-3">
            <h3 className="font-semibold">{move.displayName}</h3>
            <MoveDetails move={move} />
          </article>
        ))}
        {Array.from({ length: Math.max(0, 4 - moves.length) }, (_, index) =>
          index < freeSlots ? (
            <Button
              key={`empty-${index}`}
              type="button"
              variant="outline"
              className="h-auto min-h-20 whitespace-normal border-dashed p-4"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4 shrink-0" /> Elegir movimiento
            </Button>
          ) : (
            <div
              key={`empty-${index}`}
              className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground"
            >
              <Lock className="h-4 w-4 shrink-0" /> Espacio para TM/HM
            </div>
          ),
        )}
      </div>
      {!capture.origin && (
        <p className="mt-3 text-xs text-muted-foreground">
          Pokémon de una partida anterior. Conserva sus datos; las elecciones
          gratuitas corresponden a los nuevos iniciales.
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Por ahora puedes preparar tus movimientos. Su ejecución y las TM/HM se
        habilitarán en la siguiente etapa.
      </p>
      {pickerOpen && freeSlots > 0 && (
        <MovePicker
          key={captureId}
          capture={capture}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}
