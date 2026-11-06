import type { CapturedPokemon, Pokemon } from "@/types/pokemon";
import { neutralBattleStages } from "@/lib/pokemonStats";
import { clearSecondaryStatuses } from "@/lib/statusTurns";

// Al terminar un encuentro conserva HP, nivel y estados principales.
export function clearBattleConditions(capture: CapturedPokemon): void {
  clearSecondaryStatuses(capture);
  capture.pokemon.battleStages = neutralBattleStages();
}

// Fainted se deriva del HP guardado; no es un estado seleccionable independiente.
export function isPokemonFainted(pokemon: Pokemon | null | undefined): boolean {
  const hp = pokemon?.stats.find((stat) => stat.name === "hp")?.value;
  return typeof hp === "number" && Number.isFinite(hp) && hp <= 0;
}

export function hasLivingHp(pokemon: Pokemon | null | undefined): boolean {
  const hp = pokemon?.stats.find((stat) => stat.name === "hp")?.value;
  return typeof hp === "number" && Number.isSafeInteger(hp) && hp > 0;
}
