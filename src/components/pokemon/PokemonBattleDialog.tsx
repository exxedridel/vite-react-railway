import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import PokemonOpponentPanel from "@/components/pokemon/PokemonOpponentPanel";
import type { BattleOpponent } from "@/lib/battleOpponent";
import PokemonHpBar from "@/components/pokemon/PokemonHpBar";
import PokemonBattleArena from "./PokemonBattleArena";
import { usePokemonProgression } from "@/hooks/usePokemonProgression";
import PokemonHpControls from "./PokemonHpControls";
import PokemonTypeBadges from "./PokemonTypeBadges";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { changePokemonHp } from "@/slices/partySlice";
type Props = {
  captureId: string | null;
  onClose: () => void;
};
const CRY_BASE =
  "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";
function PokemonBattleDialog({ captureId, onClose }: Props) {
  const dispatch = useAppDispatch();
  const capturedPokemon = useAppSelector((state) =>
    state.party.pokemons.find((item) => item.captureId === captureId),
  );
  const {
    maxHp: originalHp,
    isError,
    isFetching,
    retry,
  } = usePokemonProgression(capturedPokemon?.pokemon);
  const [opponentView, setOpponentView] = useState(false);
  const [opponent, setOpponent] = useState<BattleOpponent | null>(null);
  const cryAudioRef = useRef<HTMLAudioElement | null>(null);
  const pokemonId = capturedPokemon?.pokemon.id;
  // Cada apertura comienza en vista propia.
  useEffect(() => {
    setOpponent(null);
    setOpponentView(false);
  }, [captureId, pokemonId]);
  // Detiene el audio al cambiar de captura, cerrar o desmontar.
  useEffect(() => {
    return () => {
      cryAudioRef.current?.pause();
      cryAudioRef.current = null;
    };
  }, [captureId, opponent?.pokemon.id]);
  const stopPokemonCry = () => {
    const audio = cryAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      cryAudioRef.current = null;
    }
  };
  const handlePlayCry = (id: number) => {
    stopPokemonCry();
    const audio = new Audio(`${CRY_BASE}/${id}.ogg`);
    audio.volume = 0.6;
    cryAudioRef.current = audio;
    void audio.play().catch(() => {});
  };
  const handleClose = () => {
    stopPokemonCry();
    setOpponent(null);
    onClose();
  };
  const handleTogglePerspective = () => {
    setOpponentView((current) => !current);
  };
  // Todos los hooks se ejecutan antes de este retorno.
  if (!capturedPokemon) return null;
  const { pokemon } = capturedPokemon;
  const currentHp =
    pokemon.stats.find((stat) => stat.name === "hp")?.value ?? 0;
  const canEditHp = originalHp !== undefined;
  const handleChangeHp = (amount: number) => {
    dispatch(changePokemonHp({ captureId: capturedPokemon.captureId, amount }));
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
          document.getElementById(`battle-trigger-${captureId}`)?.focus();
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
              <DialogDescription className="sr-only">
                Combate de {pokemon.name}.
              </DialogDescription>
              <div className="mt-2">
                <PokemonTypeBadges types={pokemon.types} />
              </div>
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
              <PokemonHpControls
                currentHp={currentHp}
                maxHp={originalHp}
                onChangeHp={handleChangeHp}
              />
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
                        onClick={retry}
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
              <div className="mt-4">
                <PokemonHpBar pokemon={pokemon} />
              </div>
            </section>
            <PokemonBattleArena
              capturedPokemon={capturedPokemon}
              opponent={opponent}
              opponentView={opponentView}
              onTogglePerspective={handleTogglePerspective}
              onPlayCry={handlePlayCry}
            />
            <PokemonOpponentPanel
              key={captureId}
              opponent={opponent}
              onChange={setOpponent}
            />
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
