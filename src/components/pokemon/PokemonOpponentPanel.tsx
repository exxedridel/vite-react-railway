import PokemonHpControls from "./PokemonHpControls";
import PokemonHpBar from "./PokemonHpBar";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { store } from "@/store/store";
import { captureWildOpponent } from "@/slices/partySlice";
import { canChooseStarter } from "@/lib/starterPokemon";
import { generateWildEncounter } from "@/lib/wildEncounter";
import PokemonTypeBadges from "./PokemonTypeBadges";
import { clampStage, normalizeStages } from "@/lib/battleModifiers";
import PokemonBattleStatsControls from "./PokemonBattleStatsControls";
import {
  createLeveledPokemon,
  STAT_NAMES,
  getMaxHp,
  getCurrentHp,
} from "@/lib/pokemonStats";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Loader2, Minus, Plus, Search, Swords, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pokeApi, useLazyGetPokemonQuery } from "@/api/pokeApi";
import type { Pokemon } from "@/types/pokemon";
import {
  BATTLE_STATS,
  createBattleOpponent,
  createNeutralStages,
  changeOpponentLevel,
  type BattleOpponent,
  type BattleStat,
} from "@/lib/battleOpponent";

type Props = {
  opponent: BattleOpponent | null;
  onChange: Dispatch<SetStateAction<BattleOpponent | null>>;
};

function OpponentSummary({
  pokemon,
  showSprite = true,
}: {
  pokemon: Pokemon;
  showSprite?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {showSprite && (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border bg-muted">
          {failed ? (
            <span className="px-1 text-center text-xs text-muted-foreground">
              Sin sprite
            </span>
          ) : (
            <img
              src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`}
              alt={pokemon.name}
              onError={() => setFailed(true)}
              className="h-20 w-20 object-contain [image-rendering:pixelated]"
            />
          )}
        </div>
      )}
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="break-words font-semibold capitalize">
            {pokemon.name}
          </h3>
          <span className="text-xs text-muted-foreground">
            #{String(pokemon.id).padStart(3, "0")}
          </span>
        </div>
        <PokemonTypeBadges types={pokemon.types} />
      </div>
    </div>
  );
}

export default function PokemonOpponentPanel({ opponent, onChange }: Props) {
  const dispatch = useAppDispatch();
  const partySize = useAppSelector((state) => state.party.pokemons.length);
  const needsStarter = useAppSelector((state) => canChooseStarter(state.party));
  const [captureTargetId, setCaptureTargetId] = useState<string | null>(null);
  const [encounterKind, setEncounterKind] = useState<"wild" | "trainer">(
    "wild",
  );
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const generationRef = useRef<AbortController | null>(null);
  const captureButtonRef = useRef<HTMLButtonElement>(null);
  const cancelCaptureRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const cancelRemoveRef = useRef<HTMLButtonElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState("");
  const [candidate, setCandidate] = useState<Pokemon | null>(null);
  const [searching, setSearching] = useState(false);
  const [getPokemon] = useLazyGetPokemonQuery();
  const requestVersion = useRef(0);
  const searchingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () => () => {
      requestVersion.current += 1;
      generationRef.current?.abort();
    },
    [],
  );

  const handleOpenChange = (next: boolean) => {
    generationRef.current?.abort();
    generationRef.current = null;
    setBuilding(false);
    setProgress({ done: 0, total: 0 });
    if (next) setEncounterKind("wild");
    requestVersion.current += 1;
    searchingRef.current = false;
    setSearching(false);
    setCandidate(null);
    setSearch("");
    setOpen(next);
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (searchingRef.current || generationRef.current) return;
    const raw = search.trim().toLowerCase();
    if (!raw) {
      toast.error("Escribe el nombre o número del rival.");
      return;
    }
    const query = /^\d+$/.test(raw) ? String(Number(raw)) : raw;
    const version = ++requestVersion.current;
    searchingRef.current = true;
    setSearching(true);
    setCandidate(null);
    try {
      const result = await getPokemon(query, false).unwrap();
      if (version !== requestVersion.current) return;
      const required = STAT_NAMES;
      if (
        !required.every((name) =>
          result.stats.some(
            (stat) =>
              stat.name === name &&
              Number.isSafeInteger(stat.value) &&
              stat.value > 0,
          ),
        )
      ) {
        toast.error("El Pokémon no tiene todas las estadísticas necesarias.");
        return;
      }
      setCandidate(createLeveledPokemon(result));
    } catch (error: unknown) {
      if (version !== requestVersion.current) return;
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? error.status
          : undefined;
      toast.error(
        status === 404
          ? "Pokémon no encontrado. Revisa su nombre en inglés o número."
          : "No se pudo consultar al rival. Intenta nuevamente.",
      );
    } finally {
      if (version === requestVersion.current) {
        searchingRef.current = false;
        setSearching(false);
      }
    }
  };

  const handleConfirm = async () => {
    if (!candidate || searching || generationRef.current) return;
    if (encounterKind === "trainer") {
      onChange(createBattleOpponent(candidate));
      handleOpenChange(false);
      return;
    }
    const controller = new AbortController();
    generationRef.current = controller;
    setBuilding(true);
    const version = requestVersion.current;
    try {
      const encounter = await generateWildEncounter(
        candidate,
        async (id) => {
          const cached = pokeApi.endpoints.getMove.select(id)(
            store.getState(),
          ).data;
          if (cached) return cached;
          const request = dispatch(pokeApi.endpoints.getMove.initiate(id));
          const abort = () => request.abort();
          controller.signal.addEventListener("abort", abort, { once: true });
          try {
            return await request.unwrap();
          } finally {
            controller.signal.removeEventListener("abort", abort);
            request.unsubscribe();
          }
        },
        controller.signal,
        (done, total) => {
          if (!controller.signal.aborted && version === requestVersion.current)
            setProgress({ done, total });
        },
      );
      if (controller.signal.aborted || version !== requestVersion.current)
        return;
      onChange(encounter);
      handleOpenChange(false);
      toast.success("Encuentro salvaje preparado.");
    } catch (error: unknown) {
      if (controller.signal.aborted || version !== requestVersion.current)
        return;
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los movimientos. Intenta nuevamente.",
      );
    } finally {
      if (generationRef.current === controller) {
        controller.abort();
        generationRef.current = null;
        setBuilding(false);
      }
    }
  };

  const handleCapture = () => {
    if (!captureTargetId) return;
    const current = store.getState().party;
    if (current.pokemons.length >= 6) {
      toast.error(
        "Tu equipo está lleno. Libera un espacio antes de registrar la captura.",
      );
      return;
    }
    if (current.opponent?.encounterId !== captureTargetId) {
      setCaptureTargetId(null);
      toast.error("Este encuentro ya no está disponible.");
      return;
    }
    const name = current.opponent.pokemon.name;
    const action = captureWildOpponent(captureTargetId);
    dispatch(action);
    if (
      !store
        .getState()
        .party.pokemons.some((p) => p.captureId === action.payload.captureId)
    ) {
      toast.error(
        "No se pudo registrar la captura. Revisa que el encuentro tenga sus tres movimientos.",
      );
      return;
    }
    setCaptureTargetId(null);
    toast.success(`${name} se unió a tu equipo.`, {
      description: "Conserva su nivel, HP y sus tres movimientos.",
    });
  };

  const changeWildHp = (amount: number) => {
    if (!Number.isSafeInteger(amount)) return;
    onChange((current) => {
      if (!current || current.kind !== "wild") return current;
      const maximum = getMaxHp(current.pokemon);
      if (maximum === undefined) return current;
      return {
        ...current,
        pokemon: {
          ...current.pokemon,
          stats: current.pokemon.stats.map((stat) =>
            stat.name === "hp"
              ? {
                  ...stat,
                  value: Math.max(0, Math.min(maximum, stat.value + amount)),
                }
              : stat,
          ),
        },
      };
    });
  };

  const changeStage = (stat: BattleStat, amount: number) => {
    onChange((current) =>
      current
        ? {
            ...current,
            stages: {
              ...normalizeStages(current.stages),
              [stat]: clampStage((current.stages[stat] ?? 0) + amount),
            },
          }
        : null,
    );
  };

  const handleChangeLevel = (amount: number) => {
    onChange((current) =>
      current ? changeOpponentLevel(current, amount) : null,
    );
  };

  return (
    <section
      aria-label="Oponente del combate"
      className="shrink-0 space-y-3 rounded-2xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Swords className="h-4 w-4 text-brand" /> Oponente
        </h2>
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleOpenChange(true)}
        >
          {opponent ? "Cambiar oponente" : "Seleccionar oponente"}
        </Button>
      </div>

      {opponent ? (
        <>
          <OpponentSummary
            key={opponent.pokemon.id}
            pokemon={opponent.pokemon}
            showSprite={false}
          />
          <div
            role="group"
            aria-label="Nivel del oponente"
            className="flex items-center gap-2"
          >
            <span
              className="mr-1 text-sm font-semibold tabular-nums"
              aria-live="polite"
            >
              Lv. {opponent.pokemon.level ?? 50}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={(opponent.pokemon.level ?? 50) <= 1}
              onClick={() => handleChangeLevel(-1)}
              aria-label="Bajar un nivel del oponente"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={
                !Number.isSafeInteger((opponent.pokemon.level ?? 50) + 1)
              }
              onClick={() => handleChangeLevel(1)}
              aria-label="Subir un nivel del oponente"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {opponent.kind === "wild" ? (
            <div className="space-y-4 rounded-xl border bg-muted/20 p-3">
              <p className="text-xs font-semibold text-brand">
                Pokémon salvaje
              </p>
              <PokemonHpControls
                currentHp={getCurrentHp(opponent.pokemon)}
                maxHp={getMaxHp(opponent.pokemon)}
                onChangeHp={changeWildHp}
              />
              <PokemonHpBar pokemon={opponent.pokemon} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              HP máximo: {getMaxHp(opponent.pokemon) ?? "—"} · El rival controla
              su HP en su celular.
            </p>
          )}
          {opponent.kind === "wild" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">
                Movimientos del salvaje · {opponent.moves?.length ?? 0}/4
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(opponent.moves ?? []).map((move, index) => (
                  <article
                    key={move.id}
                    className="space-y-2 rounded-xl border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <h4 className="text-sm font-semibold">
                        {move.displayName}
                      </h4>
                      {index === 0 && (
                        <span className="text-[10px] font-semibold text-brand">
                          STAB
                        </span>
                      )}
                    </div>
                    <PokemonTypeBadges types={[move.type]} />
                    <p className="text-xs capitalize text-muted-foreground">
                      {move.damageClass} · Power {move.power ?? "—"} · Accuracy{" "}
                      {move.accuracy === null ? "—" : `${move.accuracy}%`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {move.description}
                    </p>
                  </article>
                ))}
                <div className="flex min-h-20 items-center justify-center rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                  Cuarto espacio reservado para TM/HM
                </div>
              </div>
              <Button
                type="button"
                ref={captureButtonRef}
                className="w-full gap-2"
                disabled={
                  partySize >= 6 ||
                  needsStarter ||
                  !opponent.encounterId ||
                  opponent.moves?.length !== 3
                }
                onClick={() => setCaptureTargetId(opponent.encounterId ?? null)}
              >
                <img src="/Pokeball-PNG.png" alt="" className="h-5 w-5" />{" "}
                Captura conseguida
              </Button>
              <p className="text-xs text-muted-foreground">
                {partySize >= 6
                  ? "Equipo lleno (6/6). El salvaje seguirá guardado hasta que liberes un espacio."
                  : needsStarter
                    ? "Primero debes elegir tu Pokémon inicial."
                    : "Usa este botón solo si la tirada de dados del tablero permitió capturarlo."}
              </p>
            </div>
          )}
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Stats y cambios durante el combate
            </summary>
            <div className="mt-3">
              <PokemonBattleStatsControls
                pokemon={opponent.pokemon}
                stages={opponent.stages}
                ownerLabel={`rival ${opponent.pokemon.name}`}
                onChangeStage={changeStage}
                onReset={() =>
                  onChange((current) =>
                    current
                      ? { ...current, stages: createNeutralStages() }
                      : null,
                  )
                }
              />
            </div>
          </details>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            ref={removeButtonRef}
            onClick={() => setRemoveDialogOpen(true)}
          >
            <X className="h-4 w-4" /> Quitar oponente
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Busca al Pokémon rival para cargar sus tipos y estadísticas.
        </p>
      )}

      <Dialog
        open={
          captureTargetId !== null && captureTargetId === opponent?.encounterId
        }
        onOpenChange={(next) => {
          if (!next) setCaptureTargetId(null);
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[425px]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelCaptureRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (captureButtonRef.current ?? triggerRef.current)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>¿Captura conseguida?</DialogTitle>
            <DialogDescription>
              Confirma que tus dados permitieron atrapar a{" "}
              {opponent?.pokemon.name}. Se unirá al equipo con su nivel actual,
              HP y sus tres movimientos. Sus modificadores temporales de combate
              volverán a cero y dejará de aparecer como oponente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              ref={cancelCaptureRef}
              onClick={() => setCaptureTargetId(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={partySize >= 6 || needsStarter}
              onClick={handleCapture}
            >
              Sí, agregar al equipo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeDialogOpen && opponent !== null}
        onOpenChange={setRemoveDialogOpen}
      >
        <DialogContent
          className="sm:max-w-[425px]"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRemoveRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (removeButtonRef.current ?? triggerRef.current)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>¿Quitar oponente?</DialogTitle>
            <DialogDescription>
              Se quitará a{" "}
              <span className="font-semibold capitalize">
                {opponent?.pokemon.name}
              </span>{" "}
              y se descartarán su nivel y sus modificadores guardados. Tu equipo
              no cambiará.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              ref={cancelRemoveRef}
              type="button"
              variant="outline"
              onClick={() => setRemoveDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onChange(null);
                setRemoveDialogOpen(false);
              }}
            >
              Quitar oponente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[425px]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Preparar oponente</DialogTitle>
            <DialogDescription>
              Busca por nombre en inglés o número. El rival se carga con sus
              estadísticas calculadas a nivel 50.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={searching || building} className="space-y-2">
            <legend className="text-sm font-medium">Tipo de encuentro</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="encounter-kind"
                  value="wild"
                  checked={encounterKind === "wild"}
                  onChange={() => setEncounterKind("wild")}
                />{" "}
                Salvaje
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="encounter-kind"
                  value="trainer"
                  checked={encounterKind === "trainer"}
                  onChange={() => setEncounterKind("trainer")}
                />{" "}
                De otro entrenador
              </label>
            </div>
          </fieldset>
          {encounterKind === "wild" && (
            <p className="text-xs text-muted-foreground">
              Se generarán tres movimientos compatibles: un ataque STAB y dos
              aleatorios. El cuarto espacio quedará para TM/HM.
            </p>
          )}
          <form onSubmit={handleSearch} className="space-y-2">
            <label htmlFor="opponent-search" className="text-sm font-medium">
              Nombre o número
            </label>
            <div className="flex gap-2">
              <Input
                id="opponent-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCandidate(null);
                }}
                disabled={searching || building}
                placeholder="charizard o 6"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-w-0 flex-1"
              />
              <Button
                type="submit"
                disabled={searching || building || !search.trim()}
                aria-label="Buscar oponente"
              >
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
          {candidate && (
            <div className="space-y-3 rounded-xl border p-3">
              <OpponentSummary key={candidate.id} pokemon={candidate} />
              <dl className="grid grid-cols-2 gap-2 text-xs">
                {candidate.stats.map((stat) => (
                  <div
                    key={stat.name}
                    className="flex justify-between gap-2 rounded-md bg-muted p-2"
                  >
                    <dt>
                      {stat.name === "hp"
                        ? "HP"
                        : (BATTLE_STATS.find(
                            (entry) => entry.name === stat.name,
                          )?.label ?? stat.name)}
                    </dt>
                    <dd className="font-semibold tabular-nums">{stat.value}</dd>
                  </div>
                ))}
              </dl>
              {opponent && (
                <p className="text-xs text-muted-foreground">
                  Al confirmar se reemplazará el rival actual y sus cambios
                  temporales.
                </p>
              )}
            </div>
          )}
          {building && (
            <p role="status" className="text-sm text-muted-foreground">
              Consultando movimientos: {progress.done}/{progress.total}. La
              primera carga puede tardar unos segundos.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={!candidate || searching || building}
              onClick={handleConfirm}
            >
              {building
                ? "Preparando encuentro…"
                : encounterKind === "wild"
                  ? "Iniciar encuentro salvaje"
                  : "Usar este oponente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
