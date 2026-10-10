import { useEffect, useState } from "react";
import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import PokemonHpBar from "@/components/pokemon/PokemonHpBar";
import { useLazyGetPokemonQuery } from "@/api/pokeApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { updatePokemonStats } from "@/slices/partySlice";

import PokemonStatusControl from "@/components/pokemon/PokemonStatusControl";

type Props = {
  captureId: string | null;
  onClose: () => void;
};

function PokemonBattleDialog({ captureId, onClose }: Props) {
  const dispatch = useAppDispatch();

  const capturedPokemon = useAppSelector((state) =>
    state.party.pokemons.find((item) => item.captureId === captureId),
  );

  const [getPokemon, { data, isError, isFetching }] = useLazyGetPokemonQuery();

  const [spriteError, setSpriteError] = useState(false);

  const pokemonId = capturedPokemon?.pokemon.id;

  useEffect(() => {
    setSpriteError(false);

    if (pokemonId !== undefined) {
      void getPokemon(String(pokemonId), true);
    }
  }, [pokemonId, getPokemon]);

  // Todos los hooks se ejecutan antes de este retorno.
  if (!capturedPokemon) return null;

  const { pokemon } = capturedPokemon;

  const currentHp =
    pokemon.stats.find((stat) => stat.name === "hp")?.value ?? 0;

  const originalHp =
    data?.id === pokemon.id
      ? data.stats.find((stat) => stat.name === "hp")?.value
      : undefined;

  const canEditHp = originalHp !== undefined;

  const handleChangeHp = (amount: number) => {
    if (originalHp === undefined) return;

    // Lee el estado más reciente, incluso con pulsaciones rápidas.
    const latestCapture = store
      .getState()
      .party.pokemons.find((item) => item.captureId === captureId);

    if (!latestCapture) return;

    const latestHp = latestCapture.pokemon.stats.find(
      (stat) => stat.name === "hp",
    );

    if (!latestHp) return;

    const nextHp = Math.min(originalHp, Math.max(0, latestHp.value + amount));

    if (nextHp === latestHp.value) return;

    // Conserva todos los demás stats tal como están guardados.
    const values = Object.fromEntries(
      latestCapture.pokemon.stats.map((stat) => [
        stat.name,
        stat.name === "hp" ? nextHp : stat.value,
      ]),
    );

    dispatch(
      updatePokemonStats({
        captureId: latestCapture.captureId,
        values,
      }),
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="
          !left-0 !top-0
          !h-[100dvh] !w-screen !max-w-none
          !translate-x-0 !translate-y-0
          !rounded-none border-0 p-0
          flex flex-col gap-0 overflow-hidden
          bg-background text-foreground
          [&>button]:hidden
          data-[state=open]:animate-none
          data-[state=closed]:animate-none
        "
        onCloseAutoFocus={(event) => {
          event.preventDefault();

          document.getElementById(`battle-trigger-${captureId}`)?.focus();
        }}
      >
        {/* Encabezado y cierre */}
        <header
          className="
            shrink-0 border-b px-4 pb-4
            pt-[max(1rem,env(safe-area-inset-top))]
          "
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-brand">
                En combate
              </p>

              <DialogTitle className="mt-1 break-words text-2xl font-bold capitalize">
                {pokemon.name}
              </DialogTitle>

              <DialogDescription className="mt-1">
                Controla el HP de tu Pokémon.
              </DialogDescription>
            </div>

            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-full"
                aria-label="Cerrar combate y volver al equipo"
              >
                <X className="h-5 w-5" />
              </Button>
            </DialogClose>
          </div>
        </header>

        {/* Contenido desplazable para pantallas pequeñas */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="
              mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4
              px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]
            "
          >
            {/* HP persistido */}
            <section
              aria-label="Puntos de salud"
              className="shrink-0 rounded-2xl border bg-card p-4 text-card-foreground"
            >
              <PokemonHpBar pokemon={pokemon} />

              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 gap-2"
                  disabled={!canEditHp || currentHp <= 0}
                  onClick={() => handleChangeHp(-1)}
                  aria-label="Restar un punto de HP"
                >
                  <Minus className="h-5 w-5" />
                  <span>1 HP</span>
                </Button>

                <div
                  className="min-w-12 text-center"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span className="text-3xl font-bold tabular-nums">
                    {currentHp}
                  </span>

                  <span className="block text-xs text-muted-foreground">
                    HP
                  </span>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="h-12 gap-2"
                  disabled={!canEditHp || currentHp >= (originalHp ?? 0)}
                  onClick={() => handleChangeHp(1)}
                  aria-label="Sumar un punto de HP"
                >
                  <Plus className="h-5 w-5" />
                  <span>1 HP</span>
                </Button>
              </div>

              {!canEditHp && (
                <div className="mt-3 text-center">
                  {isError ? (
                    <>
                      <p className="text-xs text-destructive">
                        No se pudo consultar el HP máximo.
                      </p>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isFetching}
                        onClick={() => {
                          void getPokemon(String(pokemon.id), false);
                        }}
                      >
                        {isFetching ? "Consultando…" : "Reintentar"}
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Consultando HP máximo…
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Tu Pokémon visto de espaldas */}
            {/* Campo de batalla compacto */}
            <section
              aria-label={`${pokemon.name} en combate`}
              className="
    relative isolate h-44 shrink-0 overflow-hidden
    rounded-3xl border
    sm:h-52
  "
            >
              {/* Cielo */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-brand/20 via-background to-muted"
              />

              {/* Terreno */}
              <div
                aria-hidden="true"
                className="
      absolute inset-x-0 bottom-0 h-[45%]
      border-t border-brand/20
      bg-gradient-to-b from-brand/10 to-brand/25
    "
              />

              <div className="absolute left-3 top-3 z-20 max-w-[65%]">
                <PokemonStatusControl capturedPokemon={capturedPokemon} />
              </div>

              {currentHp === 0 && (
                <span
                  role="status"
                  className="absolute right-3 top-3 z-20 rounded-full bg-destructive px-3 py-1 text-xs text-destructive-foreground"
                >
                  Sin HP
                </span>
              )}

              {/* Plataforma y Pokémon */}
              <div className="absolute inset-x-0 bottom-2 flex justify-center">
                <div className="relative flex h-36 w-56 items-end justify-center sm:h-44 sm:w-64">
                  {/* Borde inferior de la plataforma */}
                  <div
                    aria-hidden="true"
                    className="absolute bottom-0 h-12 w-48 rounded-[50%] bg-brand/30 sm:w-56"
                  />

                  {/* Superficie de la plataforma */}
                  <div
                    aria-hidden="true"
                    className="absolute bottom-2 h-12 w-48 rounded-[50%] border border-brand/30 bg-muted sm:w-56"
                  />

                  {/* Sombra del Pokémon */}
                  <div
                    aria-hidden="true"
                    className="absolute bottom-4 h-5 w-24 rounded-[50%] bg-foreground/15 blur-sm"
                  />

                  {spriteError ? (
                    <div className="relative z-10 flex h-32 w-40 items-center justify-center text-center text-xs text-muted-foreground">
                      Sprite de espaldas no disponible.
                    </div>
                  ) : (
                    <img
                      key={pokemon.id}
                      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${pokemon.id}.png`}
                      alt={`${pokemon.name} visto de espaldas`}
                      draggable={false}
                      onError={() => setSpriteError(true)}
                      className={`
            relative z-10 mb-2 h-36 w-36 select-none
            object-contain [image-rendering:pixelated]
            sm:h-44 sm:w-44
            ${currentHp === 0 ? "grayscale opacity-60" : ""}
          `}
                    />
                  )}
                </div>
              </div>
            </section>

            {/* Espacio reservado para los movimientos */}
            <section
              aria-label="Movimientos"
              className="shrink-0 rounded-2xl border bg-card p-4 text-card-foreground"
            >
              <h2 className="font-semibold">Movimientos</h2>

              <div className="mt-3 rounded-xl border border-dashed p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Este Pokémon todavía no tiene movimientos configurados.
                </p>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PokemonBattleDialog;
