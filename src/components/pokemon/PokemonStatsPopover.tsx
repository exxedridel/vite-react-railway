import { useEffect, useId, useState, type FormEvent } from "react";
import { Minus, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { useAppDispatch } from "@/store/hooks";
import { updatePokemonStats } from "@/slices/partySlice";
import { useLazyGetPokemonQuery } from "@/api/pokeApi";
import type { CapturedPokemon, Pokemon } from "@/types/pokemon";

const STAT_LABELS: Record<string, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  "special-attack": "Sp. Atk",
  "special-defense": "Sp. Def",
  speed: "Speed",
};

type Props = {
  capturedPokemon: CapturedPokemon;
};

function PokemonStatsPopover({ capturedPokemon }: Props) {
  const { captureId, pokemon } = capturedPokemon;

  const dispatch = useAppDispatch();
  const id = useId();
  const [getPokemon] = useLazyGetPokemonQuery();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [originalStats, setOriginalStats] = useState<Pokemon["stats"] | null>(
    null,
  );
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);

  const originalHp = originalStats?.find((stat) => stat.name === "hp")?.value;

  const ready = originalStats !== null && originalHp !== undefined;

  // Consulta los valores originales, aprovechando la caché de RTK Query.
  // No utiliza los stats editados que están guardados en el party.
  useEffect(() => {
    if (!open) return;

    let active = true;

    setOriginalStats(null);
    setLoadError(false);

    const loadOriginalStats = async () => {
      try {
        const original = await getPokemon(String(pokemon.id), true).unwrap();

        if (!active) return;

        const hp = original.stats.find((stat) => stat.name === "hp");

        if (!hp || !Number.isSafeInteger(hp.value) || hp.value < 0) {
          throw new Error("HP original inválido");
        }

        setOriginalStats(original.stats);
      } catch {
        if (active) {
          setLoadError(true);
        }
      }
    };

    void loadOriginalStats();

    return () => {
      active = false;
    };
  }, [open, pokemon.id, getPokemon, retry]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(
        Object.fromEntries(
          pokemon.stats.map((stat) => [stat.name, String(stat.value)]),
        ),
      );

      setOriginalStats(null);
      setLoadError(false);
    }

    setOpen(nextOpen);
  };

  const getMaximum = (statName: string) =>
    statName === "hp" ? (originalHp ?? 0) : Number.MAX_SAFE_INTEGER;

  const handleInputChange = (statName: string, rawValue: string) => {
    // Permite vaciar temporalmente el input para escribir otro número.
    if (rawValue === "") {
      setDraft((current) => ({
        ...current,
        [statName]: "",
      }));
      return;
    }

    const value = Number(rawValue);

    if (!Number.isSafeInteger(value)) return;

    const boundedValue = Math.min(getMaximum(statName), Math.max(0, value));

    setDraft((current) => ({
      ...current,
      [statName]: String(boundedValue),
    }));
  };

  const handleStep = (statName: string, amount: -1 | 1) => {
    setDraft((current) => {
      const currentValue = Number(current[statName] || 0);

      const nextValue = Math.min(
        getMaximum(statName),
        Math.max(0, currentValue + amount),
      );

      return {
        ...current,
        [statName]: String(nextValue),
      };
    });
  };

  const handleReset = () => {
    if (!originalStats) return;

    setDraft(
      Object.fromEntries(
        originalStats.map((stat) => [stat.name, String(stat.value)]),
      ),
    );
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ready) return;

    const values: Record<string, number> = {};

    for (const stat of pokemon.stats) {
      const rawValue = (draft[stat.name] ?? "").trim();
      const value = Number(rawValue);

      if (rawValue === "" || !Number.isSafeInteger(value) || value < 0) {
        toast.error(
          `${STAT_LABELS[stat.name] ?? stat.name}: escribe un entero de 0 en adelante.`,
        );
        return;
      }

      if (stat.name === "hp" && value > originalHp!) {
        toast.error(`HP no puede superar su valor original: ${originalHp}.`);
        return;
      }

      values[stat.name] = value;
    }

    dispatch(
      updatePokemonStats({
        captureId,
        values,
      }),
    );

    setOpen(false);
    toast.success("Estadísticas actualizadas.");
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2"
          aria-label={`Ver y editar stats de ${pokemon.name}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Stats
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="center"
        sideOffset={8}
        collisionPadding={12}
        aria-labelledby={`${id}-title`}
        className="w-80 max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-muted">
              <img
                src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`}
                alt=""
                aria-hidden="true"
                className="h-12 w-12 object-contain [image-rendering:pixelated]"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            </div>

            <div className="min-w-0 space-y-1">
              <h3
                id={`${id}-title`}
                className="break-words font-semibold capitalize"
              >
                {pokemon.name}
              </h3>

              <p className="text-xs text-muted-foreground">
                {ready
                  ? `HP máximo: ${originalHp}. Guarda para aplicar los cambios.`
                  : "Consultando estadísticas originales…"}
              </p>
            </div>
          </div>

          {loadError && (
            <div role="alert" className="space-y-2">
              <p className="text-sm text-destructive">
                No se pudieron obtener los valores originales.
              </p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoadError(false);
                  setRetry((current) => current + 1);
                }}
              >
                Reintentar
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {pokemon.stats.map((stat) => {
              const value = Number(draft[stat.name] || 0);
              const label = STAT_LABELS[stat.name] ?? stat.name;

              return (
                <div
                  key={stat.name}
                  className="flex items-center justify-between gap-2"
                >
                  <label
                    htmlFor={`${id}-${stat.name}`}
                    className="min-w-0 text-sm text-muted-foreground"
                  >
                    {label}
                  </label>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      disabled={!ready || value <= 0}
                      onClick={() => handleStep(stat.name, -1)}
                      aria-label={`Restar 1 a ${label}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>

                    <Input
                      id={`${id}-${stat.name}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={getMaximum(stat.name)}
                      step={1}
                      required
                      disabled={!ready}
                      value={draft[stat.name] ?? ""}
                      onChange={(event) =>
                        handleInputChange(stat.name, event.target.value)
                      }
                      className="h-9 w-16 px-1 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      disabled={!ready || value >= getMaximum(stat.name)}
                      onClick={() => handleStep(stat.name, 1)}
                      aria-label={`Sumar 1 a ${label}`}
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
            variant="outline"
            size="sm"
            className="w-full gap-2"
            disabled={!ready}
            onClick={handleReset}
          >
            <RotateCcw className="h-4 w-4" />
            Reiniciar
          </Button>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>

            <Button type="submit" size="sm" disabled={!ready}>
              Guardar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export default PokemonStatsPopover;
