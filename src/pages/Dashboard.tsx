import { toast } from "sonner";
import { store } from "@/store/store";
import { canChooseStarter } from "@/lib/starterPokemon";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import PokemonActionsDialog from "@/components/pokemon/PokemonActionsDialog";
import PokemonStatsPopover from "@/components/pokemon/PokemonStatsPopover";
import PokemonBagDialog from "@/components/pokemon/PokemonBagDialog";
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
  const activeBattleCaptureId = useAppSelector((state) => {
    const opponent = state.party.opponent;
    const opponentHp =
      opponent?.pokemon.stats.find((stat) => stat.name === "hp")?.value ?? 0;
    return opponent && opponentHp > 0
      ? (state.party.battleField?.activeCaptureId ?? null)
      : null;
  });
  const [actionsCaptureId, setActionsCaptureId] = useState<string | null>(null);
  const [battleCaptureId, setBattleCaptureId] = useState<string | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const cryAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasPokemon = party.length > 0;
  const eligible = useAppSelector((state) => canChooseStarter(state.party));

  useEffect(
    () => () => {
      cryAudioRef.current?.pause();
      cryAudioRef.current = null;
    },
    [],
  );

  // Si se reinicia la partida, limpia también los diálogos y el audio locales.
  useEffect(() => {
    if (party.length === 0) setBagOpen(false);
    if (
      battleCaptureId &&
      !party.some((p) => p.captureId === battleCaptureId)
    ) {
      cryAudioRef.current?.pause();
      cryAudioRef.current = null;
      setBattleCaptureId(null);
    }
    if (
      actionsCaptureId &&
      !party.some((p) => p.captureId === actionsCaptureId)
    ) {
      setActionsCaptureId(null);
    }
  }, [party, battleCaptureId, actionsCaptureId]);

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
  const handleConfirmRemove = (pokemonToRemove: CapturedPokemon) => {
    if (store.getState().party.pokemons.length <= 1) {
      toast.error(
        "No puedes quedarte sin ningún Pokémon. Agrega otro antes de liberar este.",
      );
      return;
    }
    if (battleCaptureId === pokemonToRemove.captureId) handleCloseBattle();
    dispatch(removePokemon(pokemonToRemove.captureId));
    setActionsCaptureId(null);
    const nextPokemon = store.getState().party.pokemons[0];
    if (nextPokemon)
      requestAnimationFrame(() =>
        document.getElementById(`battle-trigger-${nextPokemon.captureId}`)?.focus(),
      );
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
          {eligible ? (
            <button
              type="button"
              onClick={() => setPokemonDialogOpen(true)}
              className="card mt-8 w-full max-w-[800px] cursor-pointer select-none space-y-1 text-center"
            >
              <span className="flex flex-row items-center justify-center gap-1 text-lg font-bold">
                <Plus className="mt-[0.5px] shrink-0 text-brand" />
                <span>Elige tu Pokémon inicial</span>
              </span>
              <span className="block">
                Configura tu partida y elige hasta dos movimientos.
              </span>
            </button>
          ) : (
            <div className="mt-8 w-full max-w-[800px] rounded-2xl border bg-card p-5 text-center">
              <p className="font-semibold">Tu equipo está vacío</p>
              <p className="mt-2 text-sm text-muted-foreground">
                La elección del inicial ya fue utilizada. Puedes reiniciar el
                juego desde la barra de navegación para comenzar otra partida.
                Los siguientes Pokémon se obtienen mediante encuentros salvajes.
              </p>
            </div>
          )}
        </>
      )}

      {hasPokemon && (
        <div className="w-full max-w-[800px]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="ml-2 text-lg font-bold">
              Party · {party.length}/6 pokémon
            </h2>
            <PokemonBagDialog open={bagOpen} onOpenChange={setBagOpen} />
          </div>
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
                  <div className="flex items-center">
                    <PokemonHpBar pokemon={pokemon} />
                  </div>
                  <button
                    id={`battle-trigger-${captureId}`}
                    type="button"
                    onClick={() => handleOpenBattle(capturedPokemon)}
                    aria-label={`Abrir combate de ${pokemon.name}${isFainted ? ", debilitado" : ""}`}
                    aria-haspopup="dialog"
                    data-in-battle={
                      captureId === activeBattleCaptureId ? "true" : undefined
                    }
                    className={`relative my-2 block h-28 w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-36 ${captureId === activeBattleCaptureId ? "ring-2 ring-brand ring-offset-2 ring-offset-card" : ""}`}
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
                  {capturedPokemon.origin === "starter" &&
                    (capturedPokemon.initialMovesChosen ?? 0) < 2 && (
                      <button
                        type="button"
                        className="mt-3 text-left text-xs font-medium text-brand underline underline-offset-4"
                        onClick={() => handleOpenBattle(capturedPokemon)}
                      >
                        Elegir movimientos iniciales
                      </button>
                    )}
                  <div className="mt-auto grid grid-cols-2 gap-1.5 pt-3">
                    <PokemonStatsPopover capturedPokemon={capturedPokemon} />
                    <PokemonActionsDialog
                      capturedPokemon={capturedPokemon}
                      open={actionsCaptureId === captureId}
                      onOpenChange={(open) =>
                        setActionsCaptureId(open ? captureId : null)
                      }
                      onRelease={handleConfirmRemove}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {battleCaptureId !== null && (
        <PokemonBattleDialog
          key={battleCaptureId}
          captureId={battleCaptureId}
          onClose={handleCloseBattle}
        />
      )}

      {/* Visible solo en el dashboard, sin superponerse a sus diálogos. */}
      {battleCaptureId === null &&
        !bagOpen &&
        actionsCaptureId === null &&
        !pokemonDialogOpen && (
          <FloatingOpponent
            onOpenBattle={(captureId) => {
              const activePokemon = party.find(
                (capture) => capture.captureId === captureId,
              );
              if (activePokemon) handleOpenBattle(activePokemon);
            }}
          />
        )}
    </div>
  );
};
export default Dashboard;
