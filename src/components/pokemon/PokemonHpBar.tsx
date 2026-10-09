import { useEffect } from "react";

import { Progress } from "@/components/ui/progress";
import { useLazyGetPokemonQuery } from "@/api/pokeApi";
import type { Pokemon } from "@/types/pokemon";

type Props = {
  pokemon: Pokemon;
};

function PokemonHpBar({ pokemon }: Props) {
  const [getPokemon, { data, isError }] = useLazyGetPokemonQuery();

  useEffect(() => {
    void getPokemon(String(pokemon.id), true);
  }, [pokemon.id, getPokemon]);

  const currentHp =
    pokemon.stats.find((stat) => stat.name === "hp")?.value ?? 0;

  const originalHp =
    data?.id === pokemon.id
      ? data.stats.find((stat) => stat.name === "hp")?.value
      : undefined;

  if (originalHp === undefined) {
    return (
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted-foreground">
          HP · {currentHp}
        </p>

        <div className="h-2 rounded-full bg-muted" />

        <p className="text-[11px] text-muted-foreground">
          {isError ? "Máximo no disponible" : "Cargando HP…"}
        </p>
      </div>
    );
  }

  const percentage =
    originalHp > 0
      ? Math.min(100, Math.max(0, (currentHp / originalHp) * 100))
      : 0;

  const colorClass =
    percentage < 20
      ? "[&>div]:bg-red-500"
      : percentage < 50
        ? "[&>div]:bg-yellow-500"
        : "[&>div]:bg-green-500";

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="font-semibold">HP</span>

        <span className="text-muted-foreground tabular-nums">
          {currentHp}/{originalHp}
        </span>
      </div>

      <Progress
        value={percentage}
        aria-label={`HP de ${pokemon.name}`}
        aria-valuetext={`${currentHp} de ${originalHp} HP`}
        className={`h-2 bg-muted ${colorClass}`}
      />
    </div>
  );
}

export default PokemonHpBar;