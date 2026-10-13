import type { Pokemon, PokemonStatus, BattleStages } from "@/types/pokemon";
import { getEffectiveStat, normalizeStages } from "./battleModifiers";
export function battleSpeed(
  pokemon: Pokemon,
  statuses: readonly PokemonStatus[] = [],
  stages?: Partial<BattleStages>,
): number | null {
  const value = pokemon.stats.find((s) => s.name === "speed")?.value;
  if (value === undefined || !Number.isFinite(value) || value < 1) return null;
  const speed = getEffectiveStat(
    value,
    normalizeStages(stages ?? pokemon.battleStages).speed,
  );
  return statuses.includes("paralyzed")
    ? Math.max(1, Math.floor(speed / 4))
    : speed;
}
