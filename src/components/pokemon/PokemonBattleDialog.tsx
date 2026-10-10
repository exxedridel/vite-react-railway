import { useEffect, useRef, useState } from "react";
import { Minus, Plus, SwitchCamera, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import PokemonHpBar from "@/components/pokemon/PokemonHpBar";
import PokemonStatusControl from "@/components/pokemon/PokemonStatusControl";

import { useLazyGetPokemonQuery } from "@/api/pokeApi";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { updatePokemonStats } from "@/slices/partySlice";

type Props = {
  captureId: string | null;
  onClose: () => void;
};

const CRY_BASE =
  "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

const SPRITE_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

function PokemonBattleDialog({ captureId, onClose }: Props) {
  const dispatch = useAppDispatch();

  const capturedPokemon = useAppSelector((state) =>
    state.party.pokemons.find((item) => item.captureId === captureId)
  );

  const [getPokemon, { data, isError, isFetching }] =
    useLazyGetPokemonQuery();

  const [spriteError, setSpriteError] = useState(false);
  const [opponentView, setOpponentView] = useState(false);

  const cryAudioRef = useRef<HTMLAudioElement | null>(null);
  const pokemonId = capturedPokemon?.pokemon.id;

  useEffect(() => {
    if (pokemonId !== undefined) {
      void getPokemon(String(pokemonId), true);
    }
  }, [pokemonId, getPokemon]);

  // Cada apertura comienza en vista propia.
  useEffect(() => {
    setOpponentView(false);
    setSpriteError(false);
  }, [captureId, pokemonId]);

  // Detiene el audio al cambiar de captura, cerrar o desmontar.
  useEffect(() => {
    return () => {
      cryAudioRef.current?.pause();
      cryAudioRef.current = null;
    };
  }, [captureId]);

  const stopPokemonCry = () => {
    const audio = cryAudioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      cryAudioRef.current = null;
    }
  };

  const handlePlayCry = () => {
    if (!capturedPokemon) return;

    stopPokemonCry();

    const audio = new Audio(
      `${CRY_BASE}/${capturedPokemon.pokemon.id}.ogg`
    );

    audio.volume = 0.6;
    cryAudioRef.current = audio;

    void audio.play().catch(() => {});
  };

  const handleClose = () => {
    stopPokemonCry();
    onClose();
  };

  const handleTogglePerspective = () => {
    setSpriteError(false);
    setOpponentView((current) => !current);
  };

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

  const battleSprite = opponentView
    ? `${SPRITE_BASE}/${pokemon.id}.png`
    : `${SPRITE_BASE}/back/${pokemon.id}.png`;

  const handleChangeHp = (amount: number) => {
    if (originalHp === undefined) return;

    // Lee el estado más reciente para soportar pulsaciones rápidas.
    const latestCapture = store
      .getState()
      .party.pokemons.find((item) => item.captureId === captureId);

    if (!latestCapture) return;

    const latestHp = latestCapture.pokemon.stats.find(
      (stat) => stat.name === "hp"
    );

    if (!latestHp) return;

    const nextHp = Math.min(
      originalHp,
      Math.max(0, latestHp.value + amount)
    );

    if (nextHp === latestHp.value) return;

    // Conserva los demás stats.
    const values = Object.fromEntries(
      latestCapture.pokemon.stats.map((stat) => [
        stat.name,
        stat.name === "hp" ? nextHp : stat.value,
      ])
    );

    dispatch(
      updatePokemonStats({
        captureId: latestCapture.captureId,
        values,
      })
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleClose();
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

          document
            .getElementById(`battle-trigger-${captureId}`)
            ?.focus();
        }}
      >
        {/* Encabezado */}
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

        {/* Contenido desplazable */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="
              mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4
              px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]
            "
          >
            {/* HP y controles */}
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
                  disabled={
                    !canEditHp || currentHp >= (originalHp ?? 0)
                  }
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

            {/* Campo de batalla con cambio de perspectiva */}
            <section
              aria-label={`${pokemon.name}: ${
                opponentView ? "vista rival" : "vista propia"
              }`}
              className={`
                pokemon-arena
                relative isolate h-44 shrink-0 overflow-hidden
                rounded-3xl border sm:h-52
                ${opponentView ? "pokemon-arena--opponent" : ""}
              `}
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
                  pokemon-arena-ground
                  absolute inset-x-0 bottom-0
                  border-t border-brand/20
                  bg-gradient-to-b from-brand/10 to-brand/25
                "
              />

              {/* Plataforma del lado contrario */}
              <div
                aria-hidden="true"
                className="
                  pokemon-arena-empty-platform
                  absolute rounded-[50%]
                  border border-brand/20 bg-brand/10
                "
              />

              {/* Selector y estados activos */}
              <div className="absolute left-3 top-3 z-30 max-w-[65%]">
                <PokemonStatusControl
                  capturedPokemon={capturedPokemon}
                />
              </div>

              {currentHp === 0 && (
                <span
                  role="status"
                  className="absolute right-3 top-3 z-30 rounded-full bg-destructive px-3 py-1 text-xs text-destructive-foreground"
                >
                  Sin HP
                </span>
              )}

              {/* Plataforma ocupada y Pokémon */}
              <div className="pokemon-arena-position absolute z-10">
                <div className="pokemon-arena-model relative h-full w-full">
                  {/* Borde inferior de la plataforma */}
                  <div
                    aria-hidden="true"
                    className="
                      pokemon-arena-platform
                      absolute bottom-0 left-1/2
                      -translate-x-1/2 rounded-[50%]
                      bg-brand/30
                    "
                  />

                  {/* Superficie */}
                  <div
                    aria-hidden="true"
                    className="
                      pokemon-arena-platform
                      absolute bottom-2 left-1/2
                      -translate-x-1/2 rounded-[50%]
                      border border-brand/30 bg-muted
                    "
                  />

                  {/* Sombra */}
                  <div
                    aria-hidden="true"
                    className="
                      absolute bottom-4 left-1/2
                      h-5 w-24 -translate-x-1/2
                      rounded-[50%] bg-foreground/15 blur-sm
                    "
                  />

                  {spriteError ? (
                    <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground">
                      Sprite no disponible.
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePlayCry}
                      aria-label={`Escuchar el cry de ${pokemon.name}`}
                      className="
                        pokemon-arena-sprite
                        absolute bottom-2 left-1/2 z-10
                        -translate-x-1/2 rounded-xl
                        focus-visible:outline-none
                        focus-visible:ring-2 focus-visible:ring-ring
                        focus-visible:ring-offset-2
                        focus-visible:ring-offset-background
                      "
                    >
                      <img
                        key={battleSprite}
                        src={battleSprite}
                        alt={`${pokemon.name} ${
                          opponentView
                            ? "visto de frente"
                            : "visto de espaldas"
                        }`}
                        draggable={false}
                        onError={() => setSpriteError(true)}
                        className={`
                          h-full w-full select-none object-contain
                          [image-rendering:pixelated]
                          ${
                            currentHp === 0
                              ? "grayscale opacity-60"
                              : "pokemon-breathe"
                          }
                        `}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Indicador de perspectiva */}
              <span
                aria-live="polite"
                className="absolute bottom-3 left-3 z-20 rounded-full border bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {opponentView ? "Vista rival" : "Vista propia"}
              </span>

              {/* Botón de perspectiva */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleTogglePerspective}
                aria-pressed={opponentView}
                aria-label={
                  opponentView
                    ? "Cambiar a vista propia"
                    : "Cambiar a vista rival"
                }
                className="
                  absolute bottom-3 right-3 z-30
                  h-10 w-10 rounded-full
                  bg-background shadow-sm
                "
              >
                <SwitchCamera className="h-5 w-5 text-brand" />
              </Button>
            </section>

            {/* Movimientos */}
            <section
              aria-label="Movimientos"
              className="flex flex-1 flex-col rounded-2xl border bg-card p-4 text-card-foreground"
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