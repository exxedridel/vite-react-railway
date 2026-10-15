import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { setBattleWeather } from "@/slices/partySlice";
import { battleContextKey } from "@/lib/battleEngine";
import { getBattleField, weatherSummary } from "@/lib/battleField";
import { getCurrentHp } from "@/lib/pokemonStats";
import {
  GEN3_WEATHER,
  GEN3_WEATHER_COMMON,
  type WeatherChoice,
} from "@/lib/gen3Weather";

export default function PokemonWeatherControl({
  captureId,
}: {
  captureId: string;
}) {
  const dispatch = useAppDispatch();
  const party = useAppSelector((s) => s.party);
  const field = getBattleField(party.battleField);
  const capture = party.pokemons.find((p) => p.captureId === captureId);
  const opponent = party.opponent;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<WeatherChoice>("none");
  const [duration, setDuration] = useState("5");
  const guide = GEN3_WEATHER.find((w) => w.id === selected)!;
  const canApply = Boolean(
    capture &&
      opponent &&
      getCurrentHp(opponent.pokemon) > 0 &&
      (!field.activeCaptureId || field.activeCaptureId === captureId),
  );
  const permanent = duration === "permanent";
  const nextKind = selected === "none" ? null : selected;
  const unchanged =
    field.weather?.kind === nextKind &&
    Boolean(field.weather?.permanent) === permanent &&
    (permanent || field.weather?.turnsLeft === Number(duration));
  const noChange = selected === "none" ? !field.weather : unchanged;

  function changeChoice(value: WeatherChoice) {
    setSelected(value);
    if (value === "hail" && duration === "permanent") setDuration("5");
  }
  function apply() {
    if (!capture || !opponent || !canApply || noChange) return;
    const expectedContext = battleContextKey(
      capture,
      opponent,
      party.battleField,
    );
    dispatch(
      setBattleWeather({
        captureId,
        expectedContext,
        kind: nextKind,
        turnsLeft: permanent ? 5 : Number(duration),
        permanent,
      }),
    );
    const latest = store.getState().party;
    const actual = getBattleField(latest.battleField).weather;
    const accepted =
      nextKind === null
        ? actual === null
        : actual?.kind === nextKind &&
          Boolean(actual.permanent) === permanent &&
          (permanent || actual.turnsLeft === Number(duration));
    if (!accepted) {
      toast.error("El combate cambió. Revisa el clima e intenta nuevamente.");
      return;
    }
    toast.success(weatherSummary(actual));
    setOpen(false);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) {
          setSelected(field.weather?.kind ?? "none");
          setDuration(
            field.weather?.permanent
              ? "permanent"
              : String(field.weather?.turnsLeft ?? 5),
          );
        }
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="pointer-events-auto max-w-full cursor-pointer rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Consultar o cambiar clima. ${weatherSummary(field.weather)}`}
          title="Consultar o cambiar clima"
        >
          <span className="block">
            {
              GEN3_WEATHER.find(
                (weather) => weather.id === (field.weather?.kind ?? "none"),
              )!.icon
            }{" "}
            {weatherSummary(field.weather)}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-10 text-left">
          <DialogTitle>Clima de batalla · Gen 3</DialogTitle>
          <DialogDescription>
            Consulta sus efectos antes de aplicarlo a ambos Pokémon. Actual:{" "}
            {weatherSummary(field.weather)}.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Selecciona un clima para ver sus reglas
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GEN3_WEATHER.map((weather) => (
                <label
                  key={weather.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${selected === weather.id ? "border-brand bg-muted ring-1 ring-brand" : "bg-card"}`}
                >
                  <input
                    type="radio"
                    name="battle-weather"
                    value={weather.id}
                    checked={selected === weather.id}
                    onChange={() => changeChoice(weather.id)}
                    className="h-4 w-4 shrink-0 accent-[hsl(var(--brand))]"
                  />
                  <span>
                    <span aria-hidden="true">{weather.icon} </span>
                    {weather.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <section
            className="space-y-3 rounded-xl border bg-muted/40 p-3"
            aria-live="polite"
          >
            <h3 className="font-semibold">
              {guide.icon} {guide.name}
            </h3>
            <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed">
              {guide.effects.map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
            <details className="border-t pt-2 text-sm">
              <summary className="cursor-pointer font-medium">
                Habilidades y excepciones · consulta
              </summary>
              <ul className="mt-2 list-disc space-y-2 pl-4 text-muted-foreground">
                {guide.abilities.map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
            </details>
          </section>
          {selected !== "none" && (
            <div className="space-y-2">
              <label
                htmlFor="weather-duration"
                className="block text-sm font-medium"
              >
                Duración restante
              </label>
              <select
                id="weather-duration"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {[5, 4, 3, 2, 1].map((turns) => (
                  <option key={turns} value={turns}>
                    {turns} turno{turns === 1 ? "" : "s"}
                  </option>
                ))}
                {selected !== "hail" && (
                  <option value="permanent">
                    Sin límite · habilidad Gen 3
                  </option>
                )}
              </select>
              <p className="text-xs text-muted-foreground">
                Elige los turnos que quedan si el rival ya lo activó. No se
                descuenta ningún turno al guardar.
              </p>
            </div>
          )}
          <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              Reglas generales y alcance de la app
            </summary>
            <ul className="mt-3 list-disc space-y-2 pl-4 text-muted-foreground">
              {GEN3_WEATHER_COMMON.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <p className="mt-3 text-muted-foreground">
              La app aplica los modificadores de movimientos ya programados y el
              daño residual por tipo al finalizar turno. Las habilidades, los
              cambios de forma y la invulnerabilidad de Dig/Dive no se detectan
              automáticamente: resuelve esas excepciones manualmente con los
              controles. Las reglas anteriores sirven como consulta, no activan
              habilidades.
            </p>
          </details>
          {!canApply && (
            <p className="text-sm text-muted-foreground">
              Puedes consultar las reglas. Para cambiar el clima debe haber un
              oponente vivo y este Pokémon debe estar seleccionado en combate.
            </p>
          )}
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={!canApply || noChange}
            onClick={apply}
          >
            {selected === "none" ? "Quitar clima" : "Aplicar clima"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
