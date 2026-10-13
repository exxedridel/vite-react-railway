import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { finishBattleTurn } from "@/slices/partySlice";
import { getBattleField, WEATHER_LABELS } from "@/lib/battleField";
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
  const event = useAppSelector((s) => s.party.lastFieldEvent);
  if (!c || !o) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
      <span className="text-muted-foreground" title={event?.details.join(" ")}>
        {field.weather
          ? `${WEATHER_LABELS[field.weather.kind]} · ${field.weather.turnsLeft} turnos`
          : `Turno ${field.turn}`}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={getCurrentHp(o.pokemon) <= 0}
        title="Cuando ambos hayan terminado de actuar: aplica el clima, reduce los contadores de estados, descuenta un turno y retira Flinch."
        onClick={() =>
          dispatch(
            finishBattleTurn({
              captureId,
              expectedTurn: field.turn,
              expectedContext: battleContextKey(c, o, field),
            }),
          )
        }
      >
        Finalizar turno {field.turn}
      </Button>
    </div>
  );
}
