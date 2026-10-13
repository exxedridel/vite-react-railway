import {
  isTimedStatus,
  type TimedStatus,
  type StatusTurns,
} from "@/lib/statusTurns";
import { useId, useState, useRef, useEffect } from "react";
import { STATUS_OPTIONS, type PokemonStatus } from "@/types/pokemon";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = {
  name: string;
  statuses: readonly PokemonStatus[];
  onToggle: (status: PokemonStatus) => void;
  onClear: () => void;
  statusTurns?: StatusTurns;
  onSetTurns: (status: TimedStatus, turns: number) => void;
};

// Una misma interfaz para ambos lados; cada wrapper conserva su forma de guardar.
export default function PokemonStatusPicker({
  name,
  statuses,
  onToggle,
  onClear,
  statusTurns = {},
  onSetTurns,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TimedStatus | null>(null);
  const countLabel = (status: PokemonStatus) =>
    isTimedStatus(status) ? ` · ${statusTurns[status] ?? "?"} turnos` : "";
  const select = (status: PokemonStatus) => {
    if (isTimedStatus(status)) setEditing(status);
    else onToggle(status);
  };
  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing) scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [editing]);
  const selected = STATUS_OPTIONS.filter((option) =>
    statuses.includes(option.id),
  );
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setEditing(null);
      }}
      modal
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="pokemon-status-trigger rounded-full border bg-background/95 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Status de ${name}${selected.length ? `: ${selected.map((s) => s.label + countLabel(s.id)).join(", ")}` : ": sin estados"}`}
          title={
            selected.length
              ? selected.map((s) => s.label + countLabel(s.id)).join(", ")
              : `Status de ${name}`
          }
        >
          {selected.length ? (
            <span
              className="pokemon-status-trigger__icons"
              style={{
                gridTemplateColumns:
                  selected.length <= 3 ? "1fr" : "repeat(2, minmax(0, 1fr))",
              }}
              aria-hidden="true"
            >
              {selected.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-0.5">
                  {s.icon}
                  {isTimedStatus(s.id) && (
                    <small className="text-[10px] font-bold tabular-nums">
                      {statusTurns[s.id] ?? "?"}
                    </small>
                  )}
                </span>
              ))}
            </span>
          ) : (
            "Status"
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={8}
        collisionPadding={12}
        avoidCollisions
        aria-labelledby={titleId}
        className="z-[80] flex min-h-0 flex-col gap-0 overflow-hidden p-0"
        style={{
          width: "min(350px, calc(100vw - 24px))",
          maxHeight:
            "min(500px, calc(100dvh - 24px), var(--radix-popover-content-available-height))",
        }}
      >
        <header className="shrink-0 border-b px-3 py-2">
          <h3 id={titleId} className="text-sm font-semibold">
            Status · <span className="capitalize">{name}</span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Un estado principal y efectos adicionales combinables.
          </p>
        </header>
        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3"
          style={{ WebkitOverflowScrolling: "touch" }}
          ref={scrollRef}
        >
          {editing && (
            <section
              className="shrink-0 border-b bg-muted/40 p-3"
              aria-label="Elegir contador"
            >
              <p className="mb-2 text-xs font-semibold">
                {STATUS_OPTIONS.find((s) => s.id === editing)?.label}: elige de
                1 a 6 turnos
              </p>
              <div className="grid grid-cols-6 gap-1">
                {[1, 2, 3, 4, 5, 6].map((turns) => (
                  <Button
                    key={turns}
                    type="button"
                    size="sm"
                    variant={
                      statusTurns[editing] === turns ? "default" : "outline"
                    }
                    onClick={() => {
                      onSetTurns(editing, turns);
                      setEditing(null);
                    }}
                    aria-label={`${turns} turnos`}
                  >
                    {turns}
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex justify-between gap-2">
                {statuses.includes(editing) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      onToggle(editing);
                      setEditing(null);
                    }}
                  >
                    Quitar estado
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
              </div>
            </section>
          )}

          {selected.length > 0 && (
            <section aria-label="Estados seleccionados" className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                Seleccionados
              </p>
              {selected.map((s) => (
                <div key={s.id} className="rounded-lg border bg-muted/40 p-2">
                  <p className="text-xs font-semibold">
                    {s.icon} {s.label}
                    {countLabel(s.id)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.rule}</p>
                  {isTimedStatus(s.id) && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-semibold text-brand underline"
                      onClick={() => setEditing(s.id as TimedStatus)}
                    >
                      {statusTurns[s.id]
                        ? "Editar contador"
                        : "Elegir duración"}
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          {(["primary", "additional"] as const).map((group) => (
            <section key={group} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground">
                {group === "primary"
                  ? "Estado principal"
                  : "Efectos adicionales"}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.filter((s) => s.group === group).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={statuses.includes(s.id)}
                    onClick={() => select(s.id)}
                    className={`min-h-10 rounded-lg border px-2 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${statuses.includes(s.id) ? "border-brand bg-muted font-semibold" : "bg-card hover:bg-muted"}`}
                  >
                    <span aria-hidden="true">{s.icon}</span> {s.label}
                    {statuses.includes(s.id) ? `${countLabel(s.id)} ✓` : ""}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="flex shrink-0 gap-2 border-t bg-popover p-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-w-0 flex-1 text-xs"
            disabled={!selected.length}
            onClick={() => {
              onClear();
              setEditing(null);
            }}
          >
            Quitar todos los estados
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Listo
          </Button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
