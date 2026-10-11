import type { BattleStageName, BattleStages, Pokemon } from "@/types/pokemon";
import { neutralBattleStages } from "@/lib/pokemonStats";

export const BATTLE_STAT_OPTIONS = [
  { name: "attack", label: "Attack" },
  { name: "defense", label: "Defense" },
  { name: "special-attack", label: "Sp. Atk" },
  { name: "special-defense", label: "Sp. Def" },
  { name: "speed", label: "Speed" },
  { name: "accuracy", label: "Accuracy" },
  { name: "evasiveness", label: "Evasiveness" },
] as const;

export function clampStage(stage: number): number {
  return Number.isFinite(stage)
    ? Math.max(-6, Math.min(6, Math.trunc(stage)))
    : 0;
}
export function isBattleStageName(name: string): name is BattleStageName {
  return BATTLE_STAT_OPTIONS.some((stat) => stat.name === name);
}
export function normalizeStages(stages?: Partial<BattleStages>): BattleStages {
  const result = neutralBattleStages();
  for (const stat of BATTLE_STAT_OPTIONS)
    result[stat.name] = clampStage(stages?.[stat.name] ?? 0);
  return result;
}
export function stageMultiplier(stage: number): number {
  const bounded = clampStage(stage);
  return bounded >= 0 ? (2 + bounded) / 2 : 2 / (2 - bounded);
}
export function getEffectiveStat(valueAtLevel: number, stage: number): number {
  return Math.max(1, Math.floor(valueAtLevel * stageMultiplier(stage)));
}
// Devuelve HP actual y los cinco stats efectivos. No cambia las bases ni pokemon.stats.
export function getEffectiveBattleStats(
  pokemon: Pokemon,
  stages = pokemon.battleStages,
) {
  const normalized = normalizeStages(stages);
  return Object.fromEntries(
    pokemon.stats.map((stat) => [
      stat.name,
      stat.name !== "hp" && isBattleStageName(stat.name)
        ? getEffectiveStat(stat.value, normalized[stat.name])
        : stat.value,
    ]),
  ) as Record<string, number>;
}
// Para el futuro cálculo de acierto: combina primero ambas etapas.
// No es un porcentaje final: faltan la precisión del movimiento y sus excepciones.
export function getAccuracyMultiplier(
  accuracy: number,
  evasiveness: number,
): number {
  const difference = clampStage(clampStage(accuracy) - clampStage(evasiveness));
  return difference >= 0 ? (3 + difference) / 3 : 3 / (3 - difference);
}
