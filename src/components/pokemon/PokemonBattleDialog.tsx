import PokemonRivalActions from "./PokemonRivalActions";
import PokemonOpponentStatusControl from "./PokemonOpponentStatusControl";
import { BattleResultView } from "./PokemonMoveExecutionDialog";
import BattleMusicControl from "./BattleMusicControl";
import { getBattlePresence } from "@/lib/battlePresence";
import PokemonMovesPanel from "./PokemonMovesPanel";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Minus, Plus, X } from "lucide-react";
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
import { store } from "@/store/store";
import PokemonPlayerPanel from "./PokemonPlayerPanel";
import {
  changePokemonHp,
  setPokemonLevel,
  setBattleOpponent,
} from "@/slices/partySlice";
type Props = {
  captureId: string | null;
  onClose: () => void;
};
const CRY_BASE =
  "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";
function PokemonBattleDialog({ captureId, onClose }: Props) {
  const dispatch = useAppDispatch();
  const [manageOpen, setManageOpen] = useState(false);
  const lastResult = useAppSelector((state) => state.party.lastBattleResult);
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
  // El mismo rival se comparte entre todos los Pokémon de este navegador.
  // El fallback admite localStorage anterior a esta actualización.
  const opponent = useAppSelector((state) => state.party.opponent ?? null);
  const setOpponent: Dispatch<SetStateAction<BattleOpponent | null>> = (
    update,
  ) => {
    const current = store.getState().party.opponent ?? null;
    const next = typeof update === "function" ? update(current) : update;
    // Redux recibe solo el resultado serializable, nunca la función.
    dispatch(setBattleOpponent(next));
  };
  const cryAudioRef = useRef<HTMLAudioElement | null>(null);
  const pokemonId = capturedPokemon?.pokemon.id;
  // Cada apertura comienza en vista propia.
  useEffect(() => {
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
    onClose();
  };
  const handleTogglePerspective = () => {
    setOpponentView((current) => !current);
  };
  // Todos los hooks se ejecutan antes de este retorno.
  if (!capturedPokemon) return null;
  const { pokemon } = capturedPokemon;
  const presence = getBattlePresence(opponent);
  const currentLevel = pokemon.level ?? 50;
  const canEditLevel = pokemon.progressionVersion === 1;
  const handleChangeLevel = (amount: number) => {
    const latest = store
      .getState()
      .party.pokemons.find((p) => p.captureId === capturedPokemon.captureId);
    if (!latest || latest.pokemon.progressionVersion !== 1) return;
    const level = (latest.pokemon.level ?? 50) + amount;
    if (!Number.isSafeInteger(level) || level < 1) return;
    dispatch(setPokemonLevel({ captureId: latest.captureId, level }));
  };
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
              <p
                aria-live="polite"
                className={`text-xs font-semibold uppercase tracking-widest ${presence.active ? "text-brand" : "text-muted-foreground"}`}
              >
                {presence.label}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <DialogTitle className="min-w-0 break-words text-2xl font-bold capitalize">
                  {pokemon.name}
                </DialogTitle>
                <div
                  role="group"
                  aria-label="Nivel del Pokémon"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/50 p-1"
                >
                  <span
                    className="px-2 text-sm font-semibold tabular-nums"
                    aria-live="polite"
                  >
                    Lv. {currentLevel}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    disabled={!canEditLevel || currentLevel <= 1}
                    onClick={() => handleChangeLevel(-1)}
                    aria-label="Bajar un nivel"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full"
                    disabled={
                      !canEditLevel || !Number.isSafeInteger(currentLevel + 1)
                    }
                    onClick={() => handleChangeLevel(1)}
                    aria-label="Subir un nivel"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <DialogDescription className="sr-only">
                Combate de {pokemon.name}.
              </DialogDescription>
              <div className="mt-2">
                <PokemonTypeBadges types={pokemon.types} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <BattleMusicControl compact />
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
            {!opponentView && (
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
            )}
            {opponentView && opponent && (
              <PokemonRivalActions
                key={`hp:${opponent.encounterId ?? opponent.pokemon.id}`}
                section="hp"
                opponent={opponent}
                captureId={capturedPokemon.captureId}
                onChange={setOpponent}
              />
            )}
            {opponentView && !opponent && (
              <p className="rounded-xl border p-4 text-sm text-muted-foreground">
                Selecciona un oponente desde el escenario.
              </p>
            )}
            <PokemonBattleArena
              capturedPokemon={capturedPokemon}
              opponent={opponent}
              opponentView={opponentView}
              onTogglePerspective={handleTogglePerspective}
              onPlayCry={handlePlayCry}
              rivalStatusControl={
                opponent ? (
                  <PokemonOpponentStatusControl
                    key={opponent.encounterId ?? opponent.pokemon.id}
                    opponent={opponent}
                    onChange={setOpponent}
                  />
                ) : null
              }
              manageControl={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="bg-background/90"
                  onClick={() => setManageOpen(true)}
                >
                  {opponent ? "Encuentro" : "Elegir rival"}
                </Button>
              }
            />
            {!opponentView ? (
              <>
                <details
                  key={`own-moves:${captureId}`}
                  className="shrink-0 rounded-2xl border bg-card p-4 text-card-foreground"
                >
                  <summary className="cursor-pointer text-sm font-semibold">
                    Movimientos de tu Pokémon
                  </summary>
                  <div className="mt-3 [&>section]:border-0 [&>section]:p-0">
                    <PokemonMovesPanel
                      captureId={capturedPokemon.captureId}
                      showLastResult={false}
                    />
                  </div>
                </details>
                <PokemonPlayerPanel captureId={capturedPokemon.captureId} />
              </>
            ) : (
              opponent && (
                <>
                  <details
                    key={`rival-moves:${captureId}:${opponent.encounterId ?? opponent.pokemon.id}`}
                    className="shrink-0 rounded-2xl border bg-card p-4 text-card-foreground"
                  >
                    <summary className="cursor-pointer text-sm font-semibold">
                      Movimientos del rival
                    </summary>
                    <div className="mt-3 [&>section]:border-0 [&>section]:p-0">
                      <PokemonRivalActions
                        key={`moves:${captureId}:${opponent.encounterId ?? opponent.pokemon.id}`}
                        section="moves"
                        opponent={opponent}
                        captureId={capturedPokemon.captureId}
                        onChange={setOpponent}
                      />
                    </div>
                  </details>
                  <PokemonRivalActions
                    section="stats"
                    opponent={opponent}
                    captureId={capturedPokemon.captureId}
                    onChange={setOpponent}
                  />
                </>
              )
            )}
            {lastResult && (
              <details className="shrink-0 rounded-2xl border bg-card p-4 text-card-foreground">
                <summary className="cursor-pointer text-sm font-semibold">
                  Último movimiento · {lastResult.moveName}
                </summary>
                <div className="mt-3">
                  <BattleResultView result={lastResult} />
                </div>
              </details>
            )}
            <Dialog open={manageOpen} onOpenChange={setManageOpen}>
              <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[560px]">
                <DialogTitle>Gestionar encuentro</DialogTitle>
                <DialogDescription>
                  Selecciona, cambia, captura o retira al rival y ajusta su
                  nivel.
                </DialogDescription>
                <PokemonOpponentPanel
                  opponent={opponent}
                  onChange={setOpponent}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export default PokemonBattleDialog;
