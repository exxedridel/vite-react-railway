import { STATUS_OPTIONS } from "@/types/pokemon";
import type { CapturedPokemon } from "@/types/pokemon";

type Props = {
  capturedPokemon: CapturedPokemon;
};

export default function PokemonConditionBadges({
  capturedPokemon,
}: Props) {
  const { pokemon, statuses = [] } = capturedPokemon;

  const isFainted =
    pokemon.stats.find((stat) => stat.name === "hp")?.value === 0;

  const activeStatuses = STATUS_OPTIONS.filter((status) =>
    statuses.includes(status.id),
  );

  if (!isFainted && activeStatuses.length === 0) {
    return null;
  }

  return (
    <div
      className="
        pointer-events-none absolute inset-x-1 top-1 z-10
        flex flex-wrap gap-1
      "
    >
      {isFainted && (
        <span className="inline-flex items-center gap-1 rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground shadow-sm">
          <span aria-hidden="true">💫</span>
          Debilitado
        </span>
      )}

      {activeStatuses.map((status) => (
        <span
          key={status.id}
          className="
            inline-flex items-center gap-1 rounded-md
            border border-brand/30 bg-background/90
            px-1.5 py-0.5 text-[10px] font-medium
            shadow-sm backdrop-blur-sm
          "
        >
          <span aria-hidden="true">{status.icon}</span>
          {status.label}
        </span>
      ))}
    </div>
  );
}