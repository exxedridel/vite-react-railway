import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PokemonStatsPopover from "@/components/pokemon/PokemonStatsPopover";
import PokemonHpBar from "@/components/pokemon/PokemonHpBar";
import PokemonBattleDialog from "@/components/pokemon/PokemonBattleDialog";
import PokemonTypeBadges from "@/components/pokemon/PokemonTypeBadges";
import PokemonConditionBadges from "@/components/pokemon/PokemonConditionBadges";
import FloatingOpponent from "@/components/pokemon/FloatingOpponent";
import { useAppContext } from "@/context/AppContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { removePokemon } from "@/slices/partySlice";
import type { CapturedPokemon } from "@/types/pokemon";

const CRY_BASE =
  "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

const Dashboard = () => {
  const { setPokemonDialogOpen, pokemonDialogOpen } = useAppContext();
  const dispatch = useAppDispatch();
  const party = useAppSelector((state) => state.party.pokemons);
  const [pokemonToRemove, setPokemonToRemove] =
    useState<CapturedPokemon | null>(null);
  const [battleCaptureId, setBattleCaptureId] = useState<string | null>(null);
  const cryAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasPokemon = party.length > 0;

  useEffect(
    () => () => {
      cryAudioRef.current?.pause();
      cryAudioRef.current = null;
    },
    [],
  );

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
    const audio = new Audio(`${CRY_BASE}/${capturedPokemon.pokemon.id}.ogg`);
    audio.volume = 0.6;
    cryAudioRef.current = audio;
    void audio.play().catch(() => {});
  };
  const handleCloseBattle = () => {
    stopPokemonCry();
    setBattleCaptureId(null);
  };
  const handleConfirmRemove = () => {
    if (!pokemonToRemove) return;
    if (battleCaptureId === pokemonToRemove.captureId) handleCloseBattle();
    dispatch(removePokemon(pokemonToRemove.captureId));
    setPokemonToRemove(null);
  };

  return (
    <div className="container mx-auto flex flex-col items-center gap-6 px-1">
      {!hasPokemon && (
        <>
          <div className="flex select-none flex-col items-center justify-center">
            <h1 className="mb-6 flex flex-col items-center justify-center gap-2 text-[32px] italic">
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
            <span className="-mt-12 text-3xl font-light">Digital Edition</span>
          </div>
          <button
            type="button"
            onClick={() => setPokemonDialogOpen(true)}
            className="card mt-8 w-full max-w-[800px] cursor-pointer select-none space-y-1 text-center"
          >
            <span className="flex flex-row items-center justify-center gap-1 text-lg font-bold">
              <Plus className="mt-[0.5px] shrink-0 text-brand" />
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
          <h2 className="mb-4 ml-2 text-lg font-bold">
            Party · {party.length}/6 pokémon
          </h2>
          <div className="grid grid-cols-2 gap-1 md:grid-cols-3">
            {party.map((capturedPokemon) => {
              const { captureId, pokemon } = capturedPokemon;
              const isFainted =
                pokemon.stats.find((stat) => stat.name === "hp")?.value === 0;
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
                      aria-label={`Liberar a ${pokemon.name}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <button
                    id={`battle-trigger-${captureId}`}
                    type="button"
                    onClick={() => handleOpenBattle(capturedPokemon)}
                    aria-label={`Abrir combate de ${pokemon.name}${isFainted ? ", debilitado" : ""}`}
                    aria-haspopup="dialog"
                    className="relative my-2 block h-28 w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-36"
                  >
                    {pokemon.image ? (
                      <img
                        src={pokemon.image}
                        alt={pokemon.name}
                        className={`h-full w-full object-contain transition-[filter,opacity] ${isFainted ? "grayscale opacity-60" : ""}`}
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        No image available
                      </span>
                    )}
                    <PokemonConditionBadges capturedPokemon={capturedPokemon} />
                  </button>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="min-w-0 break-words font-semibold capitalize">
                      {pokemon.name}
                    </h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      #{String(pokemon.id).padStart(3, "0")}
                    </span>
                  </div>
                  <div className="mt-2">
                    <PokemonTypeBadges types={pokemon.types} />
                  </div>
                  <div className="mt-auto pt-3">
                    <PokemonStatsPopover capturedPokemon={capturedPokemon} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <Dialog
        open={pokemonToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setPokemonToRemove(null);
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
              ? Volverá al stock de pokémons y se reiniciarán sus stats.
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

      {battleCaptureId !== null && (
        <PokemonBattleDialog
          key={battleCaptureId}
          captureId={battleCaptureId}
          onClose={handleCloseBattle}
        />
      )}

      {/* Visible solo en el dashboard, sin superponerse a sus diálogos. */}
      {battleCaptureId === null &&
        pokemonToRemove === null &&
        !pokemonDialogOpen && <FloatingOpponent />}
    </div>
  );
};
export default Dashboard;
