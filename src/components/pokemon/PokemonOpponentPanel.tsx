import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import {
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Swords,
  X,
} from "lucide-react";

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

import PokemonTypeBadges from "@/components/pokemon/PokemonTypeBadges";

import { useLazyGetPokemonQuery } from "@/api/pokeApi";

import {
  BATTLE_STATS,
  createBattleOpponent,
  createNeutralStages,
  getEffectiveStat,
  stageMultiplier,
  type BattleOpponent,
  type BattleStat,
} from "@/lib/battleOpponent";

import type { Pokemon } from "@/types/pokemon";

type Props = {
  opponent: BattleOpponent | null;
  onChange: Dispatch<SetStateAction<BattleOpponent | null>>;
};

type OpponentSummaryProps = {
  pokemon: Pokemon;
  showSprite?: boolean;
};

function OpponentSummary({
  pokemon,
  showSprite = true,
}: OpponentSummaryProps) {
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

export default function PokemonOpponentPanel({
  opponent,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [candidate, setCandidate] = useState<Pokemon | null>(null);
  const [searching, setSearching] = useState(false);

  const [getPokemon] = useLazyGetPokemonQuery();

  const requestVersion = useRef(0);
  const searchingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return () => {
      requestVersion.current += 1;
    };
  }, []);

  const handleOpenChange = (next: boolean) => {
    requestVersion.current += 1;
    searchingRef.current = false;

    setSearching(false);
    setCandidate(null);
    setSearch("");
    setOpen(next);
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (searchingRef.current) return;

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
      const result = await getPokemon(query, true).unwrap();

      if (version !== requestVersion.current) return;

      const required = [
        "hp",
        ...BATTLE_STATS.map((stat) => stat.name),
      ];

      const hasRequiredStats = required.every((name) =>
        result.stats.some(
          (stat) =>
            stat.name === name &&
            Number.isSafeInteger(stat.value) &&
            stat.value > 0,
        ),
      );

      if (!hasRequiredStats) {
        toast.error(
          "El Pokémon no tiene todas las estadísticas necesarias.",
        );
        return;
      }

      setCandidate(result);
    } catch (error: unknown) {
      if (version !== requestVersion.current) return;

      const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error
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

  const handleConfirm = () => {
    if (!candidate || searching) return;

    onChange(createBattleOpponent(candidate));
    handleOpenChange(false);
  };

  const changeStage = (stat: BattleStat, amount: number) => {
    onChange((current) =>
      current
        ? {
            ...current,
            stages: {
              ...current.stages,
              [stat]: Math.max(
                -6,
                Math.min(6, current.stages[stat] + amount),
              ),
            },
          }
        : null,
    );
  };

  return (
    <section
      aria-label="Oponente del combate"
      className="shrink-0 space-y-3 rounded-2xl border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Swords className="h-4 w-4 text-brand" />
          Oponente
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

          <p className="text-xs text-muted-foreground">
            HP base:{" "}
            {
              opponent.pokemon.stats.find(
                (stat) => stat.name === "hp",
              )?.value
            }{" "}
            · El rival controla su HP en su celular.
          </p>

          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Stats y cambios durante el combate
            </summary>

            <p className="my-3 text-xs text-muted-foreground">
              Todos empiezan en 0. Registra aquí los aumentos o reducciones
              por movimientos: son niveles, no puntos.
            </p>

            <div className="space-y-3">
              {BATTLE_STATS.map((stat) => {
                const base =
                  opponent.pokemon.stats.find(
                    (entry) => entry.name === stat.name,
                  )?.value ?? 1;

                const stage = opponent.stages[stat.name];
                const effective = getEffectiveStat(base, stage);

                return (
                  <div
                    key={stat.name}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {stat.label}
                      </p>

                      <p className="text-xs text-muted-foreground tabular-nums">
                        {base} → {effective} · ×
                        {Number(stageMultiplier(stage).toFixed(3))}
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={stage <= -6}
                        onClick={() => changeStage(stat.name, -1)}
                        aria-label={`Bajar un nivel de ${stat.label} del rival`}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>

                      <output
                        className="w-8 text-center text-sm font-semibold tabular-nums"
                        aria-label={`Nivel de ${stat.label}`}
                        aria-live="polite"
                      >
                        {stage > 0 ? `+${stage}` : stage}
                      </output>

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={stage >= 6}
                        onClick={() => changeStage(stat.name, 1)}
                        aria-label={`Subir un nivel de ${stat.label} del rival`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 gap-2"
              disabled={Object.values(opponent.stages).every(
                (stage) => stage === 0,
              )}
              onClick={() =>
                onChange((current) =>
                  current
                    ? {
                        ...current,
                        stages: createNeutralStages(),
                      }
                    : null,
                )
              }
            >
              <RotateCcw className="h-4 w-4" />
              Reiniciar cambios
            </Button>
          </details>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={() => onChange(null)}
          >
            <X className="h-4 w-4" />
            Quitar oponente
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Busca al Pokémon rival para cargar sus tipos y estadísticas.
        </p>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-h-[85dvh] overflow-y-auto sm:max-w-[425px]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Seleccionar oponente</DialogTitle>

            <DialogDescription>
              Busca por nombre en inglés o número. El rival se carga con
              sus estadísticas originales.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSearch} className="space-y-2">
            <label
              htmlFor="opponent-search"
              className="text-sm font-medium"
            >
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
                disabled={searching}
                placeholder="charizard o 6"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className="min-w-0 flex-1"
              />

              <Button
                type="submit"
                disabled={searching || !search.trim()}
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
              <OpponentSummary
                key={candidate.id}
                pokemon={candidate}
              />

              <dl className="grid grid-cols-2 gap-2 text-xs">
                {candidate.stats.map((stat) => (
                  <div
                    key={stat.name}
                    className="flex justify-between gap-2 rounded-md bg-muted p-2"
                  >
                    <dt>
                      {stat.name === "hp"
                        ? "HP"
                        : BATTLE_STATS.find(
                            (entry) => entry.name === stat.name,
                          )?.label ?? stat.name}
                    </dt>

                    <dd className="font-semibold tabular-nums">
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {opponent && (
                <p className="text-xs text-muted-foreground">
                  Al confirmar se reemplazará el rival actual y sus
                  cambios temporales.
                </p>
              )}
            </div>
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
              disabled={!candidate || searching}
              onClick={handleConfirm}
            >
              Usar este oponente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}