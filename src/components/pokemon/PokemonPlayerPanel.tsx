import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { usePokemonProgression } from "@/hooks/usePokemonProgression";
import {
  changePokemonBattleStage,
  resetPokemonBattleStages,
} from "@/slices/partySlice";
import PokemonBattleStatsControls from "./PokemonBattleStatsControls";

export default function PokemonPlayerPanel({
  captureId,
}: {
  captureId: string;
}) {
  const dispatch = useAppDispatch();
  const captured = useAppSelector((state) =>
    state.party.pokemons.find((p) => p.captureId === captureId),
  );
  const { ready, isError, retry } = usePokemonProgression(captured?.pokemon);
  if (!captured) return null;
  return (
    <section
      aria-label="Estadísticas de tu Pokémon"
      className="shrink-0 space-y-3 rounded-2xl border bg-card p-4 text-card-foreground"
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <SlidersHorizontal className="h-4 w-4 text-brand" /> Tu Pokémon ·{" "}
        <span className="capitalize">{captured.pokemon.name}</span>
      </h2>
      {!ready ? (
        <div className="text-sm text-muted-foreground">
          {isError ? "No se pudieron preparar los stats." : "Preparando stats…"}
          {isError && (
            <Button type="button" variant="ghost" size="sm" onClick={retry}>
              Reintentar
            </Button>
          )}
        </div>
      ) : (
        <details className="rounded-xl border p-3" >
          <summary className="cursor-pointer text-sm font-medium">
            Stats y cambios durante el combate
          </summary>
          <div className="mt-3">
            <PokemonBattleStatsControls
              pokemon={captured.pokemon}
              stages={captured.pokemon.battleStages}
              ownerLabel={captured.pokemon.name}
              onChangeStage={(stat, amount) =>
                dispatch(changePokemonBattleStage({ captureId, stat, amount }))
              }
              onReset={() => dispatch(resetPokemonBattleStages(captureId))}
            />
          </div>
        </details>
      )}
    </section>
  );
}
