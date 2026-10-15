import { APP_VERSION, RULESET_LABEL } from "@/lib/gameVersion";
import {
  REGION_OPTIONS,
  gameBalance,
  pokemonAllowed,
  type RegionId,
} from "@/lib/gameSettings";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAppContext } from "@/context/AppContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { addPokemon, configureGame } from "@/slices/partySlice";
import { useLazyGetPokemonQuery } from "@/api/pokeApi";
import { canChooseStarter, STARTER_GROUPS } from "@/lib/starterPokemon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Conserva este nombre: Layout ya monta AddPokemonDialog una sola vez.
export default function AddPokemonDialog() {
  const { pokemonDialogOpen, setPokemonDialogOpen } = useAppContext();
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.party.gameSettings);
  const [editingSettings, setEditingSettings] = useState(false);
  const [regions, setRegions] = useState<RegionId[]>(["kanto"]);
  const [settingsPage, setSettingsPage] = useState<"regions" | "balance">(
    "regions",
  );
  const [startingLevel, setStartingLevel] = useState(5);
  const [hpMultiplier, setHpMultiplier] = useState(1.3);
  const savedBalance = gameBalance(settings);
  const configurationStep = !settings || editingSettings;
  const groups = STARTER_GROUPS.filter((group) =>
    REGION_OPTIONS.some(
      (region) =>
        region.name === group.region && settings?.regions.includes(region.id),
    ),
  );
  const eligible = useAppSelector((state) => canChooseStarter(state.party));
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [getPokemon] = useLazyGetPokemonQuery();
  const requestRef = useRef<ReturnType<typeof getPokemon> | null>(null);
  const selected = STARTER_GROUPS.flatMap((g) => [...g.pokemons]).find(
    (p) => p.id === selectedId,
  );

  function cancelRequest() {
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
  }
  function close() {
    cancelRequest();
    setPokemonDialogOpen(false);
  }
  useEffect(() => {
    if (pokemonDialogOpen) {
      const balance = gameBalance(settings);
      setRegions(settings?.regions ?? ["kanto"]);
      setStartingLevel(balance.startingLevel);
      setHpMultiplier(balance.hpMultiplier);
      setSettingsPage("regions");
    }
  }, [pokemonDialogOpen, settings]);
  useEffect(() => {
    if (!pokemonDialogOpen) {
      requestRef.current?.abort();
      requestRef.current = null;
      setBusy(false);
      setSelectedId(null);
      setEditingSettings(false);
    }
  }, [pokemonDialogOpen]);
  useEffect(() => {
    if (!eligible && pokemonDialogOpen) setPokemonDialogOpen(false);
  }, [eligible, pokemonDialogOpen, setPokemonDialogOpen]);
  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
    },
    [],
  );

  async function choose() {
    if (
      !selectedId ||
      requestRef.current ||
      !canChooseStarter(store.getState().party) ||
      !pokemonAllowed(store.getState().party, selectedId)
    )
      return;
    setBusy(true);
    // Fuerza datos con learnset, incluso si existía una respuesta antigua en caché.
    const request = getPokemon(String(selectedId), false);
    requestRef.current = request;
    try {
      const pokemon = await request.unwrap();
      if (requestRef.current !== request) return;
      if (!pokemon.learnset?.moves.length) {
        toast.error(
          "No se encontró el catálogo de movimientos de este inicial. Intenta nuevamente.",
        );
        return;
      }
      if (!canChooseStarter(store.getState().party)) return;
      dispatch(addPokemon(pokemon));
      if (
        !store
          .getState()
          .party.pokemons.some(
            (p) => p.origin === "starter" && p.pokemon.id === pokemon.id,
          )
      ) {
        toast.error("No se pudo registrar la elección del inicial.");
        return;
      }
      toast.success(`${selected?.name ?? pokemon.name} se unió a tu equipo.`, {
        description:
          "Abre su pantalla de combate para elegir hasta dos movimientos.",
      });
      setPokemonDialogOpen(false);
    } catch (error: unknown) {
      if (requestRef.current !== request) return;
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : undefined;
      toast.error(
        status === "TIMEOUT_ERROR"
          ? "PokéAPI tardó demasiado. Intenta nuevamente."
          : "No se pudo cargar el inicial. Revisa tu conexión e intenta nuevamente.",
      );
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <Dialog
      open={pokemonDialogOpen && eligible}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-[560px]">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {configurationStep
              ? settingsPage === "regions"
                ? "1 · Pokémon permitidos"
                : "2 · Nivel y HP"
              : "Elige tu Pokémon inicial"}
          </DialogTitle>
          <DialogDescription>
            {configurationStep
              ? settingsPage === "regions"
                ? "Elige una o varias regiones para tus iniciales y encuentros salvajes."
                : "Estas reglas se aplicarán al inicial y a los nuevos encuentros de esta partida."
              : `Comenzará en nivel ${savedBalance.startingLevel} con HP ×${savedBalance.hpMultiplier.toFixed(1)}. Puedes elegir uno por partida y enseñarle hasta dos movimientos gratuitos.`}
          </DialogDescription>
        </DialogHeader>
        {configurationStep ? (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-2">
              {settingsPage === "regions" ? (
                <>
                  {REGION_OPTIONS.map((region) => (
                    <label
                      key={region.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${regions.includes(region.id) ? "border-brand bg-muted" : "bg-card"}`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={regions.includes(region.id)}
                        onChange={() =>
                          setRegions((current) =>
                            current.includes(region.id)
                              ? current.filter((id) => id !== region.id)
                              : [...current, region.id],
                          )
                        }
                      />
                      <span>
                        <span className="block font-semibold">
                          {region.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Especies #{region.first}–#{region.last} ·{" "}
                          {region.last - region.first + 1} Pokémon
                        </span>
                      </span>
                    </label>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Puedes combinar las tres regiones. Las formas regionales y
                    variantes de generaciones posteriores quedan fuera de esta
                    selección.
                  </p>
                </>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label
                      htmlFor="game-starting-level"
                      className="block text-sm font-semibold"
                    >
                      Nivel de aparición
                    </label>
                    <select
                      id="game-starting-level"
                      value={startingLevel}
                      onChange={(event) =>
                        setStartingLevel(Number(event.target.value))
                      }
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
                    >
                      {Array.from({ length: 100 }, (_, index) => index + 1).map(
                        (level) => (
                          <option key={level} value={level}>
                            Nivel {level}
                            {level === 5 ? " · recomendado para empezar" : ""}
                          </option>
                        ),
                      )}
                    </select>
                    <div className="flex gap-2">
                      {[5, 50].map((level) => (
                        <Button
                          key={level}
                          type="button"
                          size="sm"
                          variant={
                            startingLevel === level ? "default" : "outline"
                          }
                          onClick={() => setStartingLevel(level)}
                        >
                          Nivel {level}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      El inicial y los nuevos rivales aparecerán a este nivel.
                      Después podrás subir o bajar su nivel con los controles de
                      combate.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="game-hp-multiplier"
                      className="block text-sm font-semibold"
                    >
                      Multiplicador de HP
                    </label>
                    <select
                      id="game-hp-multiplier"
                      value={hpMultiplier}
                      onChange={(event) =>
                        setHpMultiplier(Number(event.target.value))
                      }
                      className="h-11 w-full rounded-md border border-input bg-background px-3 text-foreground"
                    >
                      {Array.from(
                        { length: 11 },
                        (_, index) => (10 + index) / 10,
                      ).map((rate) => (
                        <option key={rate} value={rate}>
                          ×{rate.toFixed(1)}
                          {rate === 1.3 ? " · valor actual" : ""}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      ×1.0 usa el HP calculado normal; ×2.0 lo duplica. Solo
                      modifica el HP, no el ataque, la defensa ni la velocidad.
                    </p>
                  </div>
                  <p className="rounded-xl border border-brand bg-muted p-3 text-sm">
                    Inicial y encuentros: <strong>nivel {startingLevel}</strong>{" "}
                    · HP <strong>×{hpMultiplier.toFixed(1)}</strong>.
                  </p>
                </div>
              )}
              <p className="rounded-xl border p-3 text-sm text-muted-foreground">
                Catálogo: {RULESET_LABEL}, basado en Emerald. Solo movimientos
                de generaciones I–III. Combate con las fórmulas adaptadas del
                tablero. App v{APP_VERSION}.
              </p>
            </div>
            <DialogFooter className="shrink-0 gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  settingsPage === "balance"
                    ? setSettingsPage("regions")
                    : close()
                }
              >
                {settingsPage === "balance" ? "Volver a regiones" : "Cancelar"}
              </Button>
              <Button
                type="button"
                disabled={!regions.length}
                onClick={() => {
                  if (settingsPage === "regions") {
                    setSettingsPage("balance");
                    return;
                  }
                  dispatch(
                    configureGame({ regions, startingLevel, hpMultiplier }),
                  );
                  setSelectedId(null);
                  setEditingSettings(false);
                }}
              >
                {settingsPage === "regions"
                  ? "Continuar a nivel y HP"
                  : "Continuar al inicial"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-1 py-2">
              {groups.map((group) => (
                <fieldset key={group.region} disabled={busy}>
                  <legend className="mb-2 text-sm font-semibold">
                    {group.region}
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {group.pokemons.map((pokemon) => (
                      <button
                        key={pokemon.id}
                        type="button"
                        aria-pressed={selectedId === pokemon.id}
                        onClick={() => setSelectedId(pokemon.id)}
                        className={`min-w-0 rounded-xl border p-2 text-center text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${selectedId === pokemon.id ? "border-brand bg-muted ring-2 ring-brand" : "bg-card hover:bg-muted"}`}
                      >
                        <img
                          src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`}
                          alt=""
                          loading="lazy"
                          className="mx-auto h-16 w-16 object-contain"
                        />
                        <span className="break-words font-medium">
                          {pokemon.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <DialogFooter className="shrink-0 gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setRegions(settings?.regions ?? ["kanto"]);
                  setStartingLevel(savedBalance.startingLevel);
                  setHpMultiplier(savedBalance.hpMultiplier);
                  setSettingsPage("regions");
                  setEditingSettings(true);
                  setSelectedId(null);
                }}
              >
                Cambiar configuración
              </Button>
              <Button
                type="button"
                disabled={!selectedId || busy}
                onClick={() => void choose()}
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {busy
                  ? "Preparando inicial…"
                  : selected
                    ? `Elegir a ${selected.name}`
                    : "Selecciona un inicial"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
