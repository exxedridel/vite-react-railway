import type { LearnedMove } from "@/types/moves";
import {
  createLeveledPokemon,
  neutralBattleStages,
  changeLevel,
  isLeveled,
} from "@/lib/pokemonStats";
import {
  BATTLE_STAT_OPTIONS,
  getEffectiveBattleStats,
} from "@/lib/battleModifiers";
import type { BattleStageName, BattleStages, Pokemon } from "@/types/pokemon";

export const BATTLE_STATS = BATTLE_STAT_OPTIONS;
export type BattleStat = BattleStageName;
export type StatStages = BattleStages;
export type BattleOpponent = {
  pokemon: Pokemon;
  stages: StatStages;
  // Los rivales guardados antes de esta versión se consideran de entrenador.
  kind?: "trainer" | "wild";
  encounterId?: string;
  moves?: LearnedMove[];
};
export function createNeutralStages(): StatStages {
  return neutralBattleStages();
}
export function createBattleOpponent(pokemon: Pokemon): BattleOpponent {
  return {
    kind: "trainer",
    pokemon: createLeveledPokemon(
      pokemon,
      pokemon.baseStats ?? pokemon.stats,
      pokemon.level ?? 50,
    ),
    stages: createNeutralStages(),
  };
}
export function changeOpponentLevel(
  opponent: BattleOpponent,
  amount: number,
): BattleOpponent {
  if (!isLeveled(opponent.pokemon) || !Number.isSafeInteger(amount))
    return opponent;
  const level = opponent.pokemon.level + amount;
  if (!Number.isSafeInteger(level) || level < 1) return opponent;
  try {
    return { ...opponent, pokemon: changeLevel(opponent.pokemon, level) };
  } catch {
    return opponent;
  }
}
export { stageMultiplier, getEffectiveStat } from "@/lib/battleModifiers";
export function getOpponentEffectiveStats(opponent: BattleOpponent) {
  return getEffectiveBattleStats(opponent.pokemon, opponent.stages);
}
