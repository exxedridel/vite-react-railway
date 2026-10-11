import type {
  BattleStages,
  LeveledPokemon,
  Pokemon,
  PokemonStat,
} from "@/types/pokemon";

export const INITIAL_LEVEL = 50;
export const STAT_NAMES = [
  "hp",
  "attack",
  "defense",
  "special-attack",
  "special-defense",
  "speed",
] as const;
export const STAT_LABELS: Record<string, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  "special-attack": "Sp. Atk",
  "special-defense": "Sp. Def",
  speed: "Speed",
  accuracy: "Accuracy",
  evasiveness: "Evasiveness",
};
export function neutralBattleStages(): BattleStages {
  return {
    attack: 0,
    defense: 0,
    "special-attack": 0,
    "special-defense": 0,
    speed: 0,
    accuracy: 0,
    evasiveness: 0,
  };
}
export function validBaseStats(
  stats: ReadonlyArray<Readonly<PokemonStat>>,
): boolean {
  return STAT_NAMES.every(
    (name) =>
      stats.filter((s) => s.name === name).length === 1 &&
      stats.some(
        (s) => s.name === name && Number.isSafeInteger(s.value) && s.value > 0,
      ),
  );
}
export function calculateStats(
  baseStats: ReadonlyArray<Readonly<PokemonStat>>,
  level: number,
): PokemonStat[] {
  if (!Number.isSafeInteger(level) || level < 1 || !validBaseStats(baseStats)) {
    throw new Error("Nivel o estadísticas base inválidos.");
  }
  return STAT_NAMES.map((name) => {
    const base = baseStats.find((s) => s.name === name)!.value;
    const value =
      Math.floor((base * level) / 50) + (name === "hp" ? level + 10 : 5);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error("Estadística fuera de rango.");
    return { name, value };
  });
}
export function isLeveled(
  pokemon: Pokemon | undefined,
): pokemon is LeveledPokemon {
  return Boolean(
    pokemon?.progressionVersion === 1 &&
      pokemon.baseStats &&
      pokemon.level &&
      pokemon.battleStages,
  );
}
export function getCurrentHp(pokemon: Pokemon): number {
  return pokemon.stats.find((s) => s.name === "hp")?.value ?? 0;
}
export function getMaxHp(pokemon: Pokemon | undefined): number | undefined {
  if (!isLeveled(pokemon)) return undefined;
  return calculateStats(pokemon.baseStats, pokemon.level).find(
    (s) => s.name === "hp",
  )!.value;
}
// Mantiene la proporción hasta la precisión posible con puntos enteros.
export function preserveHpRatio(
  current: number,
  oldMax: number,
  newMax: number,
): number {
  if (oldMax <= 0 || !Number.isFinite(current)) return 0;
  return Math.floor((Math.min(oldMax, Math.max(0, current)) * newMax) / oldMax);
}
export function createLeveledPokemon(
  source: Pokemon,
  bases = source.baseStats ?? source.stats,
  level = INITIAL_LEVEL,
): LeveledPokemon {
  const baseStats = STAT_NAMES.map((name) => {
    const stat = bases.find((s) => s.name === name);
    if (!stat) throw new Error("Faltan estadísticas base.");
    return { name, value: stat.value };
  });
  return {
    ...source,
    types: [...source.types],
    baseStats,
    progressionVersion: 1,
    level,
    battleStages: neutralBattleStages(),
    stats: calculateStats(baseStats, level),
  };
}
export function changeLevel(
  pokemon: LeveledPokemon,
  level: number,
): LeveledPokemon {
  const oldMax = getMaxHp(pokemon)!;
  const stats = calculateStats(pokemon.baseStats, level);
  const hp = stats.find((s) => s.name === "hp")!;
  hp.value = preserveHpRatio(getCurrentHp(pokemon), oldMax, hp.value);
  return { ...pokemon, level, stats };
}
