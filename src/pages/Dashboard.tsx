import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import PokemonStatsPopover from "@/components/pokemon/PokemonStatsPopover";
import PokemonHpBar from "@/components/pokemon/PokemonHpBar";
import PokemonBattleDialog from "@/components/pokemon/PokemonBattleDialog";

import { useAppContext } from "@/context/AppContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { removePokemon } from "@/slices/partySlice";

import type { CapturedPokemon } from "@/types/pokemon";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TYPE_IDS: Record<string, number> = {
  normal: 1,
  fighting: 2,
  flying: 3,
  poison: 4,
  ground: 5,
  rock: 6,
  bug: 7,
  ghost: 8,
  steel: 9,
  fire: 10,
  water: 11,
  grass: 12,
  electric: 13,
  psychic: 14,
  ice: 15,
  dragon: 16,
  dark: 17,
  fairy: 18,
};

const TYPE_ICON_BASE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-ix/scarlet-violet/small";

const CRY_BASE =
  "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

const Dashboard = () => {
  const { setPokemonDialogOpen } = useAppContext();

  const dispatch = useAppDispatch();
  const party = useAppSelector((state) => state.party.pokemons);

  const hasPokemon = party.length > 0;

  const [pokemonToRemove, setPokemonToRemove] =
    useState<CapturedPokemon | null>(null);

  const [battleCaptureId, setBattleCaptureId] = useState<string | null>(
    null
  );

  const cryAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      cryAudioRef.current?.pause();
      cryAudioRef.current = null;
    };
  }, []);

  const stopPokemonCry = () => {
    const audio = cryAudioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      cryAudioRef.current = null;
    }
  };

  const handleOpenBattle = (capturedPokemon: CapturedPokemon) => {
    stopPokemonCry();

    setBattleCaptureId(capturedPokemon.captureId);

    const audio = new Audio(
      `${CRY_BASE}/${capturedPokemon.pokemon.id}.ogg`
    );

    audio.volume = 0.6;
    cryAudioRef.current = audio;

    // La reproducción comienza desde el clic del usuario.
    // Si el audio falla, el combate sigue funcionando.
    void audio.play().catch(() => {});
  };

  const handleCloseBattle = () => {
    stopPokemonCry();
    setBattleCaptureId(null);
  };

  const handleConfirmRemove = () => {
    if (!pokemonToRemove) return;

    if (battleCaptureId === pokemonToRemove.captureId) {
      handleCloseBattle();
    }

    dispatch(removePokemon(pokemonToRemove.captureId));
    setPokemonToRemove(null);
  };

  return (
    <div className="container mx-auto px-1 flex flex-col items-center gap-6">
      {!hasPokemon && (
        <>
          <div className="flex flex-col items-center justify-center select-none">
            <h1 className="mb-6 text-[32px] italic flex flex-col justify-center items-center gap-2">
              <img
                src="/pokemon-logo.png"
                alt="pokemon-logo"
                width={300}
                height={300}
                className="-mt-2"
              />

              <span className="-mt-28 mb-4">
                <span>Master</span>
                <span className="font-bold">Trainer</span>
              </span>
            </h1>

            <span className="text-3xl font-light -mt-12">
              Digital Edition
            </span>
          </div>

          <button
            type="button"
            onClick={() => setPokemonDialogOpen(true)}
            className="card w-full max-w-[800px] space-y-1 text-center cursor-pointer select-none mt-8"
          >
            <span className="flex flex-row justify-center items-center gap-1 font-bold text-lg">
              <Plus className="text-brand shrink-0 mt-[0.5px]" />
              <span>Add a pokémon</span>
            </span>

            <span className="block">
              &nbsp;Anytime you own a token&nbsp; 🔴🟢🔵🟡
            </span>
          </button>
        </>
      )}

      {hasPokemon && (
        <div className="w-full max-w-[800px]">
          <h2 className="mb-4 text-lg font-bold ml-2">
            Party · {party.length}/6 pokémon
          </h2>

          <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
            {party.map((capturedPokemon) => {
              const { captureId, pokemon } = capturedPokemon;

              return (
                <article
                  key={captureId}
                  className="flex min-w-0 flex-col rounded-2xl border bg-card p-2.5 text-card-foreground shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <PokemonHpBar pokemon={pokemon} />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setPokemonToRemove(capturedPokemon)}
                      aria-label={`Eliminar a ${pokemon.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <button
                    id={`battle-trigger-${captureId}`}
                    type="button"
                    onClick={() => handleOpenBattle(capturedPokemon)}
                    aria-label={`Abrir combate con ${pokemon.name}`}
                    aria-haspopup="dialog"
                    className="
                      my-2 w-full rounded-xl
                      transition-colors hover:bg-muted/50
                      focus-visible:outline-none
                      focus-visible:ring-2 focus-visible:ring-ring
                      focus-visible:ring-offset-2
                      focus-visible:ring-offset-background
                    "
                  >
                    {pokemon.image ? (
                      <img
                        src={pokemon.image}
                        alt={pokemon.name}
                        draggable={false}
                        className="h-28 w-full object-contain sm:h-36"
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center text-xs text-muted-foreground sm:h-36">
                        No image available
                      </div>
                    )}
                  </button>

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="min-w-0 break-words font-semibold capitalize">
                      {pokemon.name}
                    </h3>

                    <span className="shrink-0 text-xs text-muted-foreground">
                      #{String(pokemon.id).padStart(3, "0")}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {pokemon.types.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs capitalize text-muted-foreground"
                      >
                        {TYPE_IDS[type] && (
                          <span className="inline-flex h-4 w-4 shrink-0 overflow-hidden rounded-full">
                            <img
                              src={`${TYPE_ICON_BASE}/${TYPE_IDS[type]}.png`}
                              alt=""
                              aria-hidden="true"
                              className="h-full w-full object-cover"
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          </span>
                        )}

                        {type}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto pt-3">
                    <PokemonStatsPopover
                      capturedPokemon={capturedPokemon}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* Confirmación para liberar */}
      <Dialog
        open={pokemonToRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPokemonToRemove(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>

            <DialogDescription>
              ¿Quieres liberar a{" "}
              <span className="font-semibold capitalize">
                {pokemonToRemove?.pokemon.name}
              </span>
              ? Volverá al stock de pokémons y se reiniciarán sus stats
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPokemonToRemove(null)}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmRemove}
            >
              Liberar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pantalla de combate */}
      <PokemonBattleDialog
        captureId={battleCaptureId}
        onClose={handleCloseBattle}
      />
    </div>
  );
};

export default Dashboard;