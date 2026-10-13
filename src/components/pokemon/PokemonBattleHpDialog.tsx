import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { changePokemonHp, changeOpponentHp } from "@/slices/partySlice";
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[425px]">
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
