import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePokemonProgression } from "@/hooks/usePokemonProgression";
import { calculateStats, isLeveled, STAT_LABELS } from "@/lib/pokemonStats";
import type { CapturedPokemon } from "@/types/pokemon";

// Consulta provisional. Los controles de modificadores se implementarán después.
export default function PokemonStatsPopover({
  capturedPokemon,
}: {
  capturedPokemon: CapturedPokemon;
}) {
  const { pokemon } = capturedPokemon;
  const { ready, isError, retry } = usePokemonProgression(pokemon);
  const stats = isLeveled(pokemon)
    ? calculateStats(pokemon.baseStats, pokemon.level)
    : [];
  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          Stats
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        collisionPadding={16}
        className="w-72 max-w-[calc(100vw-32px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain"
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-muted">
            <img
              src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`}
              alt=""
              className="h-14 w-14 object-contain [image-rendering:pixelated]"
            />
          </div>
          <div>
            <h3 className="font-semibold capitalize">{pokemon.name}</h3>
            <p className="text-xs text-muted-foreground">
              Lv. {pokemon.level ?? 50} · Stats calculados
            </p>
          </div>
        </div>
        {!ready ? (
          <p className="text-sm text-muted-foreground">
            {isError
              ? "No se pudieron cargar las bases."
              : "Preparando estadísticas…"}
          </p>
        ) : (
          <>
            <dl className="space-y-2">
              {stats.map((stat) => (
                <div
                  key={stat.name}
                  className="flex justify-between gap-2 text-sm"
                >
                  <dt className="text-muted-foreground">
                    {stat.name === "hp" ? "HP máximo" : STAT_LABELS[stat.name]}
                  </dt>
                  <dd className="font-semibold tabular-nums">{stat.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              <p>
                Accuracy: {pokemon.battleStages?.accuracy ?? 0} · Evasiveness:{" "}
                {pokemon.battleStages?.evasiveness ?? 0}
              </p>
              <p className="mt-1">Modificadores neutrales: 0.</p>
            </div>
            <details className="mt-3 border-t pt-3">
              <summary className="cursor-pointer text-xs font-medium">
                Base stats · referencia
              </summary>
              <dl className="mt-2 space-y-1">
                {pokemon.baseStats?.map((stat) => (
                  <div key={stat.name} className="flex justify-between text-xs">
                    <dt className="text-muted-foreground">
                      {STAT_LABELS[stat.name] ?? stat.name}
                    </dt>
                    <dd className="tabular-nums">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        )}
        {isError && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={retry}
          >
            Reintentar
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
