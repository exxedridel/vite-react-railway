import { useState, type Dispatch, type SetStateAction } from "react";
import { STATUS_OPTIONS, type PokemonStatus } from "@/types/pokemon";
import type { BattleOpponent } from "@/lib/battleOpponent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function PokemonOpponentStatusControl({
  opponent,
  onChange,
}: {
  opponent: BattleOpponent;
  onChange: Dispatch<SetStateAction<BattleOpponent | null>>;
}) {
  const [open, setOpen] = useState(false);
  const statuses = opponent.statuses ?? [];
  function change(status?: PokemonStatus) {
    onChange((current) => {
      if (
        !current ||
        current.pokemon.id !== opponent.pokemon.id ||
        current.encounterId !== opponent.encounterId
      )
        return current;
      if (!status) return { ...current, statuses: [] };
      const existing = current.statuses ?? [];
      if (existing.includes(status))
        return { ...current, statuses: existing.filter((s) => s !== status) };
      const primary =
        STATUS_OPTIONS.find((s) => s.id === status)?.group === "primary";
      return {
        ...current,
        statuses: [
          ...existing.filter(
            (s) =>
              !primary ||
              STATUS_OPTIONS.find((o) => o.id === s)?.group !== "primary",
          ),
          status,
        ],
      };
    });
  }
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-auto max-w-full whitespace-normal bg-background/90"
        onClick={() => setOpen(true)}
      >
        {statuses.length
          ? STATUS_OPTIONS.filter((s) => statuses.includes(s.id))
              .map((s) => `${s.icon} ${s.label}`)
              .join(" · ")
          : "Estados del rival"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Estados · {opponent.pokemon.name}</DialogTitle>
            <DialogDescription>
              Selecciona un estado principal y los efectos adicionales. Su
              duración y efectos se controlan manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={statuses.includes(s.id)}
                onClick={() => change(s.id)}
                className={`block w-full rounded-xl border p-3 text-left ${statuses.includes(s.id) ? "border-brand bg-muted" : "bg-card"}`}
              >
                <span className="text-sm font-semibold">
                  {s.icon} {s.label}
                  {statuses.includes(s.id) ? " ✓" : ""}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {s.rule}
                </span>
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={!statuses.length}
            onClick={() => change()}
          >
            Quitar todos los estados
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
