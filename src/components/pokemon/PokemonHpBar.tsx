import { Progress } from "@/components/ui/progress";
import { usePokemonProgression } from "@/hooks/usePokemonProgression";
import { getCurrentHp } from "@/lib/pokemonStats";
import type { Pokemon } from "@/types/pokemon";

type Props = { pokemon: Pokemon };
export default function PokemonHpBar({ pokemon }: Props) {
  const { maxHp, isError, isFetching, retry } = usePokemonProgression(pokemon);
  const currentHp = getCurrentHp(pokemon);
  if (maxHp === undefined) {
    return (
      <div className="min-w-0 flex-1 space-y-1" aria-live="polite">
        <p className="text-xs text-muted-foreground">Preparando HP · Lv. 50</p>
        <div className="h-2 rounded-full bg-muted" />
        {isError && (
          <button
            type="button"
            disabled={isFetching}
            onClick={retry}
            className="text-left text-[11px] text-destructive underline"
          >
            No se pudo actualizar. Reintentar
          </button>
        )}
      </div>
    );
  }
  const percentage = Math.min(100, Math.max(0, (currentHp / maxHp) * 100));
  const colorClass =
    percentage < 20
      ? "[&>div]:bg-red-500"
      : percentage < 50
        ? "[&>div]:bg-yellow-500"
        : "[&>div]:bg-green-500";
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="font-semibold">
          HP{" "}
          <span className="font-normal text-muted-foreground">
            · Lv. {pokemon.level}
          </span>
        </span>
        <span className="tabular-nums text-muted-foreground">
          {currentHp}/{maxHp}
        </span>
      </div>
      <Progress
        value={percentage}
        aria-label={`HP de ${pokemon.name}`}
        aria-valuetext={`${currentHp} de ${maxHp} HP`}
        className={`h-2 bg-muted ${colorClass}`}
      />
    </div>
  );
}
