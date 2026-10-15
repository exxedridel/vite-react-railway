import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { finishBattleTurn } from "@/slices/partySlice";
import { getBattleField } from "@/lib/battleField";
import { battleContextKey } from "@/lib/battleEngine";
import { getCurrentHp } from "@/lib/pokemonStats";
import { Button } from "@/components/ui/button";
export default function PokemonBattleFieldControl({
  captureId,
}: {
  captureId: string;
}) {
  const dispatch = useAppDispatch();
  const raw = useAppSelector((s) => s.party.battleField);
  const field = getBattleField(raw);
  const c = useAppSelector((s) =>
    s.party.pokemons.find((p) => p.captureId === captureId),
  );
  const o = useAppSelector((s) => s.party.opponent);
  if (!c) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 px-1 text-xs">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!o || getCurrentHp(o.pokemon) <= 0}
        title="Cuando ambos hayan terminado de actuar: aplica el clima, reduce los contadores de estados, descuenta un turno y retira Flinch."
        onClick={() => {
          if (!o) return;
          dispatch(
            finishBattleTurn({
              captureId,
              expectedTurn: field.turn,
              expectedContext: battleContextKey(c, o, field),
            }),
          );
        }}
      >
        Finalizar turno {field.turn}
      </Button>
    </div>
  );
}
