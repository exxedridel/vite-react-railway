import type { PartyState } from "@/slices/partySlice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Batch = NonNullable<PartyState["lastEmeraldBatch"]>;
export default function BattleTurnHighlightsDialog({
  batch,
  onClose,
  onReturnToArena,
}: {
  batch: Batch | null;
  onClose: () => void;
  onReturnToArena: () => void;
}) {
  return (
    <Dialog
      open={!!batch}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl p-4 sm:max-w-[560px] sm:p-6"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onReturnToArena();
        }}
      >
        <DialogHeader className="shrink-0 pr-6">
          <DialogTitle>Así fue el turno</DialogTitle>
          <DialogDescription>
            Resultado de las acciones. El detalle completo sigue en el
            historial.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain">
          {batch?.results.map((result) => {
            const protocol = result.protocol ?? [];
            const superEffective = protocol.some((l) =>
              l.startsWith("|-supereffective|"),
            );
            const resisted = protocol.some((l) => l.startsWith("|-resisted|"));
            const noHit = ["miss", "immune", "blocked"].includes(
              result.outcome,
            );
            const preparing = result.message === "Preparando movimiento";
            return (
              <article
                key={result.id}
                className="rounded-xl border bg-card p-3 text-card-foreground"
              >
                <p className="text-xs text-muted-foreground">
                  {result.actorSide === "opponent" ? "Rival" : "Tu Pokémon"}
                </p>
                <h3 className="font-semibold">
                  <span className="capitalize">{result.attackerName}</span> ·{" "}
                  {result.moveName}
                </h3>
                <p className="mt-2 text-xl font-bold tabular-nums">
                  {preparing
                    ? "Preparando ataque"
                    : result.outcome === "miss"
                      ? "Falló"
                      : result.outcome === "immune"
                        ? "Sin efecto · Inmune"
                        : result.outcome === "blocked"
                          ? "No pudo actuar"
                          : result.appliedDamage > 0
                            ? `${result.appliedDamage} HP de daño`
                            : "Sin daño directo al HP"}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
                  {result.critical && (
                    <span className="text-yellow-600 dark:text-yellow-400">
                      A critical hit!
                    </span>
                  )}
                  {superEffective && (
                    <span className="text-green-600 dark:text-green-400">
                      Super effective!
                    </span>
                  )}
                  {resisted && (
                    <span className="text-orange-600 dark:text-orange-400">
                      Not very effective
                    </span>
                  )}
                  {!noHit &&
                    !preparing &&
                    result.appliedDamage > 0 &&
                    !superEffective &&
                    !resisted && (
                      <span className="text-muted-foreground">
                        Efectividad normal
                      </span>
                    )}
                </div>
                {result.outcome === "blocked" && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {result.message}
                  </p>
                )}
              </article>
            );
          })}
          {!!batch?.highlights?.length && (
            <section className="rounded-xl bg-muted p-3">
              <h3 className="mb-2 text-sm font-semibold">Efectos del turno</h3>
              <ul className="space-y-2 text-sm">
                {batch.highlights.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </section>
          )}
          {batch && !batch.results.length && !batch.highlights?.length && (
            <p className="text-sm">
              Turno resuelto sin ataques ni efectos adicionales.
            </p>
          )}
        </div>
        <Button className="w-full shrink-0" onClick={onClose}>
          Volver al combate
        </Button>
      </DialogContent>
    </Dialog>
  );
}
