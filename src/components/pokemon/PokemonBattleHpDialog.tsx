import { store } from "@/store/store";
import { normalizeStages, clampStage } from "@/lib/battleModifiers";
import PokemonBattleStatsControls from "./PokemonBattleStatsControls";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  changePokemonBattleStage,
  resetPokemonBattleStages,
  setBattleOpponent,
  changePokemonHp,
  changeOpponentHp,
} from "@/slices/partySlice";
import { getCurrentHp, getMaxHp } from "@/lib/pokemonStats";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import PokemonHpControls from "./PokemonHpControls";
import PokemonHpBar from "./PokemonHpBar";
export default function PokemonBattleHpDialog({
  side,
  captureId,
  onClose,
}: {
  side: "player" | "opponent" | null;
  captureId: string;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const capture = useAppSelector((s) =>
    s.party.pokemons.find((p) => p.captureId === captureId),
  );
  const opponent = useAppSelector((s) => s.party.opponent);
  const pokemon = side === "player" ? capture?.pokemon : opponent?.pokemon;
  return (
    <Dialog
      open={side !== null && !!pokemon}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="capitalize">HP · {pokemon?.name}</DialogTitle>
          <DialogDescription>
            Ajusta el daño o la recuperación.
          </DialogDescription>
        </DialogHeader>
        {pokemon && (
          <>
            <PokemonHpControls
              currentHp={getCurrentHp(pokemon)}
              maxHp={getMaxHp(pokemon)}
              onChangeHp={(amount) => {
                if (side === "player")
                  dispatch(changePokemonHp({ captureId, amount }));
                else if (opponent)
                  dispatch(
                    changeOpponentHp({
                      amount,
                      expectedOpponent: JSON.stringify([
                        opponent.encounterId,
                        opponent.pokemon.id,
                        opponent.kind,
                      ]),
                    }),
                  );
              }}
            />
            <PokemonHpBar pokemon={pokemon} />
            <details
              key={`${side}:${captureId}:${opponent?.encounterId ?? opponent?.pokemon.id}`}
              className="rounded-xl border p-3"
            >
              <summary className="cursor-pointer text-sm font-semibold">
                Stats y cambios durante el combate
              </summary>
              <div className="mt-3">
                <PokemonBattleStatsControls
                  compact
                  pokemon={pokemon}
                  stages={
                    side === "player" ? pokemon.battleStages : opponent?.stages
                  }
                  ownerLabel={pokemon.name}
                  onChangeStage={(stat, amount) => {
                    if (side === "player") {
                      dispatch(
                        changePokemonBattleStage({ captureId, stat, amount }),
                      );
                    } else {
                      const current = store.getState().party.opponent;
                      if (
                        !current ||
                        !opponent ||
                        current.encounterId !== opponent.encounterId ||
                        current.pokemon.id !== opponent.pokemon.id ||
                        current.kind !== opponent.kind
                      )
                        return;
                      const stages = normalizeStages(current.stages);
                      dispatch(
                        setBattleOpponent({
                          ...current,
                          stages: {
                            ...stages,
                            [stat]: clampStage(stages[stat] + amount),
                          },
                        }),
                      );
                    }
                  }}
                  onReset={() => {
                    if (side === "player")
                      dispatch(resetPokemonBattleStages(captureId));
                    else {
                      const current = store.getState().party.opponent;
                      if (
                        !current ||
                        !opponent ||
                        current.encounterId !== opponent.encounterId ||
                        current.pokemon.id !== opponent.pokemon.id ||
                        current.kind !== opponent.kind
                      )
                        return;
                      dispatch(
                        setBattleOpponent({
                          ...current,
                          stages: normalizeStages(),
                        }),
                      );
                    }
                  }}
                />
              </div>
            </details>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
