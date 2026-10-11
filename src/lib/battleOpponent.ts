import { createLeveledPokemon, neutralBattleStages } from "@/lib/pokemonStats";
import type { BattleStages, Pokemon } from "@/types/pokemon";

export const BATTLE_STATS = [
  { name: "attack", label: "Attack" },
  { name: "defense", label: "Defense" },
  { name: "special-attack", label: "Sp. Atk" },
  { name: "special-defense", label: "Sp. Def" },
  { name: "speed", label: "Speed" },
] as const;

export type BattleStat = (typeof BATTLE_STATS)[number]["name"];
export type StatStages = BattleStages;
export type BattleOpponent = {
  pokemon: Pokemon;
  stages: StatStages;
};

export function createNeutralStages(): StatStages {
  return neutralBattleStages();
}

export function createBattleOpponent(pokemon: Pokemon): BattleOpponent {
  return {
    pokemon: createLeveledPokemon(pokemon),
    stages: createNeutralStages(),
  };
}

export function stageMultiplier(stage: number): number {
  const bounded = Number.isFinite(stage)
    ? Math.max(-6, Math.min(6, Math.trunc(stage)))
    : 0;
  return bounded >= 0 ? (2 + bounded) / 2 : 2 / (2 - bounded);
}

export function getEffectiveStat(base: number, stage: number): number {
  return Math.max(1, Math.floor(base * stageMultiplier(stage)));
}

// Valores derivados para el futuro cálculo de daño. No modifica los originales.
export function getOpponentEffectiveStats(opponent: BattleOpponent) {
  return Object.fromEntries(
    opponent.pokemon.stats.map((stat) => {
      const staged = BATTLE_STATS.find((entry) => entry.name === stat.name);
      return [
        stat.name,
        staged
          ? getEffectiveStat(stat.value, opponent.stages[staged.name])
          : stat.value,
      ];
    }),
  );
}
