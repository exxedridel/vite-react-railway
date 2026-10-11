import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BATTLE_STAT_OPTIONS,
  getEffectiveStat,
  normalizeStages,
  stageMultiplier,
} from "@/lib/battleModifiers";
import type { BattleStageName, BattleStages, Pokemon } from "@/types/pokemon";

type Props = {
  pokemon: Pokemon;
  stages: Partial<BattleStages> | undefined;
  ownerLabel: string;
  disabled?: boolean;
  onChangeStage: (stat: BattleStageName, amount: number) => void;
  onReset: () => void;
};

export default function PokemonBattleStatsControls({
  pokemon,
  stages,
  ownerLabel,
  disabled = false,
  onChangeStage,
  onReset,
}: Props) {
  const current = normalizeStages(stages);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Cada botón cambia una etapa (−6 a +6). El valor 0 es neutral.
      </p>
      <div className="space-y-3">
        {BATTLE_STAT_OPTIONS.map((stat) => {
          const stage = current[stat.name];
          const isAccuracy =
            stat.name === "accuracy" || stat.name === "evasiveness";
          const levelValue = pokemon.stats.find(
            (entry) => entry.name === stat.name,
          )?.value;
          return (
            <div
              key={stat.name}
              className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{stat.label}</p>
                {isAccuracy ? (
                  <p className="text-[11px] text-muted-foreground">
                    {stat.name === "accuracy"
                      ? "Precisión al atacar"
                      : "Dificultad para recibir un impacto"}
                  </p>
                ) : (
                  <p
                    className="text-xs tabular-nums text-muted-foreground"
                    aria-live="polite"
                  >
                    {levelValue ?? "—"} →{" "}
                    <span className="font-semibold text-foreground">
                      {levelValue === undefined
                        ? "—"
                        : getEffectiveStat(levelValue, stage)}
                    </span>
                    {" · ×"}
                    {Number(stageMultiplier(stage).toFixed(3))}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={disabled || stage <= -6}
                  onClick={() => onChangeStage(stat.name, -1)}
                  aria-label={`Bajar una etapa de ${stat.label}: ${ownerLabel}`}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <output
                  aria-label={`Etapas de ${stat.label}: ${ownerLabel}`}
                  aria-live="polite"
                  className={`w-8 text-center text-sm font-semibold tabular-nums ${stage > 0 ? "text-brand" : stage < 0 ? "text-destructive" : ""}`}
                >
                  {stage > 0 ? `+${stage}` : stage}
                </output>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  disabled={disabled || stage >= 6}
                  onClick={() => onChangeStage(stat.name, 1)}
                  aria-label={`Subir una etapa de ${stat.label}: ${ownerLabel}`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Accuracy y Evasiveness son etapas; el acierto final dependerá del
        movimiento y de ambos Pokémon.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-2"
        disabled={
          disabled || Object.values(current).every((stage) => stage === 0)
        }
        onClick={onReset}
      >
        <RotateCcw className="h-4 w-4" /> Reiniciar modificadores
      </Button>
    </div>
  );
}
