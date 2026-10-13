import { pendingBattleSwitch } from "@/lib/battleSwitch";
import { toast } from "sonner";
import PokemonBattleHpDialog from "./PokemonBattleHpDialog";
import PokemonBattleFieldControl from "./PokemonBattleFieldControl";
import { getBattleField } from "@/lib/battleField";
import PokemonRivalActions from "./PokemonRivalActions";
import PokemonOpponentStatusControl from "./PokemonOpponentStatusControl";
import PokemonLastMoveSummary from "./PokemonLastMoveSummary";
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
import PokemonBattleArena from "./PokemonBattleArena";
import PokemonTypeBadges from "./PokemonTypeBadges";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import {
  activateBattlePokemon,
  confirmBattleSwitch,
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
  const party = useAppSelector((state) => state.party);
  const next = party.pokemons.find((p) => p.captureId === captureId);
  const pending = pendingBattleSwitch(party, captureId);
  if (!next) return null;
  if (pending) {
    const { previous, expectedContext } = pending;
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogTitle>¿Cambiar de Pokémon?</DialogTitle>
          <DialogDescription>
            Retirarás a{" "}
            <span className="capitalize font-semibold">
              {previous!.pokemon.name}
            </span>{" "}
            y entrará{" "}
            <span className="capitalize font-semibold">
              {next.pokemon.name}
            </span>
            . Se quitarán los estados secundarios del que sale y se conservarán
            sus estados principales. El cambio consume la acción de tu Pokémon:
            el que entra no podrá atacar este turno. Debes pulsar «Finalizar
            turno» manualmente cuando corresponda; confirmar aquí no reduce el
            clima ni los contadores.
          </DialogDescription>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" autoFocus onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => {
                dispatch(
                  confirmBattleSwitch({
                    fromId: previous!.captureId,
                    toId: next.captureId,
                    expectedContext,
                  }),
                );
                if (
                  store.getState().party.battleField?.activeCaptureId !==
                  next.captureId
                )
                  toast.error(
                    "El combate cambió. Revisa la selección e intenta de nuevo.",
                  );
              }}
            >
              Cambiar Pokémon
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <BattleDialogContent
      key={captureId}
      captureId={captureId}
      onClose={onClose}
    />
  );
}
function BattleDialogContent({ captureId, onClose }: Props) {
  const dispatch = useAppDispatch();
  const [manageOpen, setManageOpen] = useState(false);
  const [hpSide, setHpSide] = useState<"player" | "opponent" | null>(null);
  const field = getBattleField(
    useAppSelector((state) => state.party.battleField),
  );
  useEffect(() => {
    setHpSide(null);
    if (captureId) dispatch(activateBattlePokemon(captureId));
  }, [captureId, dispatch, field.activeCaptureId]);
  const capturedPokemon = useAppSelector((state) =>
    state.party.pokemons.find((item) => item.captureId === captureId),
  );
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
  useEffect(() => {
    setHpSide(null);
  }, [opponent?.encounterId, opponent?.pokemon.id]);
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
            <PokemonBattleArena
              field={field}
              onOpenHp={setHpSide}
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
            <PokemonBattleFieldControl captureId={capturedPokemon.captureId} />
            <PokemonBattleHpDialog
              side={hpSide}
              captureId={capturedPokemon.captureId}
              onClose={() => setHpSide(null)}
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
                    {field.playerSwitchedThisTurn ? (
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        El cambio de Pokémon consumió tu acción. Resuelve la
                        acción del rival y pulsa «Finalizar turno» manualmente
                        para poder atacar de nuevo.
                      </p>
                    ) : (
                      <PokemonMovesPanel
                        captureId={capturedPokemon.captureId}
                        showLastResult={false}
                      />
                    )}
                  </div>
                </details>
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
                </>
              )
            )}
            <PokemonLastMoveSummary
              captureId={captureId}
              side={opponentView ? "opponent" : "player"}
            />
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
