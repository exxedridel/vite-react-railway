import { STATUS_OPTIONS, type CapturedPokemon } from "@/types/pokemon";
import { getCurrentHp } from "@/lib/pokemonStats";
import { isTimedStatus } from "@/lib/statusTurns";

export default function PokemonConditionBadges({
  capturedPokemon,
}: {
  capturedPokemon: CapturedPokemon;
}) {
  const fainted = getCurrentHp(capturedPokemon.pokemon) <= 0;
  const statuses = STATUS_OPTIONS.filter((option) =>
    capturedPokemon.statuses?.includes(option.id),
  );
  if (!fainted && statuses.length === 0) return null;

  return (
    <span className="pointer-events-none absolute inset-x-1 top-1 z-10 flex flex-wrap justify-center gap-1">
      {fainted && (
        <span className="rounded-md border bg-background/90 px-2 py-0.5 text-xs font-semibold text-muted-foreground shadow-sm">
          Fainted
        </span>
      )}
      {statuses.map((status) => {
        const turns = isTimedStatus(status.id)
          ? capturedPokemon.statusTurns?.[status.id]
          : undefined;
        const label = `${status.label}${turns !== undefined ? ` · ${turns}` : ""}`;
        return (
          <span
            key={status.id}
            title={label}
            aria-label={label}
            className="inline-flex items-center gap-0.5 rounded-md border bg-background/90 px-1.5 py-0.5 text-xs shadow-sm"
          >
            <span aria-hidden="true">{status.icon}</span>
            {turns !== undefined && (
              <span aria-hidden="true" className="font-semibold tabular-nums">
                {turns}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
