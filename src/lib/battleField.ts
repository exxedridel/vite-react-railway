import type { Pokemon } from "@/types/pokemon";
import { getCurrentHp, getMaxHp } from "./pokemonStats";
export type WeatherKind = "sun" | "rain" | "sand" | "hail";
export type FieldSource =
  | { side: "player"; captureId: string }
  | { side: "opponent" };
export type BattleField = {
  version: 1;
  turn: number;
  activeCaptureId: string | null;
  playerSwitchedThisTurn?: boolean;
  weather: { kind: WeatherKind; turnsLeft: number } | null;
  mudSport: FieldSource[] | null;
  waterSport: FieldSource[] | null;
};
export const WEATHER_LABELS: Record<WeatherKind, string> = {
  sun: "Sunny Day",
  rain: "Rain Dance",
  sand: "Sandstorm",
  hail: "Hail",
};
export const WEATHER_MOVES: Readonly<Record<number, WeatherKind>> = {
  241: "sun",
  240: "rain",
  201: "sand",
  258: "hail",
};
export function emptyBattleField(): BattleField {
  return {
    version: 1,
    turn: 1,
    activeCaptureId: null,
    weather: null,
    mudSport: null,
    waterSport: null,
  };
}
export function getBattleField(field?: BattleField | null): BattleField {
  return field?.version === 1 ? field : emptyBattleField();
}
export function sourceMatches(a: FieldSource | null, b: FieldSource) {
  return (
    !!a &&
    a.side === b.side &&
    (a.side !== "player" ||
      (b.side === "player" && a.captureId === b.captureId))
  );
}
export function switchFieldPokemon(
  field: BattleField,
  captureId: string,
): void {
  if (field.activeCaptureId === captureId) return;
  for (const key of ["mudSport", "waterSport"] as const) {
    const remaining = field[key]?.filter((source) => source.side !== "player");
    field[key] = remaining?.length ? remaining : null;
  }
  field.activeCaptureId = captureId;
}
export function clearFieldSource(
  field: BattleField,
  source: FieldSource,
): void {
  for (const key of ["mudSport", "waterSport"] as const) {
    const remaining = field[key]?.filter(
      (current) => !sourceMatches(current, source),
    );
    field[key] = remaining?.length ? remaining : null;
  }
}
export function activateMoveField(
  field: BattleField,
  moveId: number,
  source: FieldSource,
): string | null {
  const weather = WEATHER_MOVES[moveId];
  if (weather) {
    if (field.weather?.kind === weather) return null;
    field.weather = { kind: weather, turnsLeft: 5 };
    return `${WEATHER_LABELS[weather]} activado durante 5 turnos.`;
  }
  if (moveId === 300) {
    if (field.mudSport?.some((current) => sourceMatches(current, source)))
      return null;
    field.mudSport = [...(field.mudSport ?? []), source];
    return "Mud Sport activo: potencia Electric ×0.5 mientras su usuario siga en combate.";
  }
  if (moveId === 346) {
    if (field.waterSport?.some((current) => sourceMatches(current, source)))
      return null;
    field.waterSport = [...(field.waterSport ?? []), source];
    return "Water Sport activo: potencia Fire ×0.5 mientras su usuario siga en combate.";
  }
  return null;
}
export function fieldMoveFailure(
  field: BattleField,
  moveId: number,
  source: FieldSource,
): string | null {
  const weather = WEATHER_MOVES[moveId];
  if (weather && field.weather?.kind === weather)
    return `${WEATHER_LABELS[weather]} ya está activo; el movimiento falla sin reiniciar su duración.`;
  if (
    moveId === 300 &&
    field.mudSport?.some((current) => sourceMatches(current, source))
  )
    return "Mud Sport ya está activo para este Pokémon.";
  if (
    moveId === 346 &&
    field.waterSport?.some((current) => sourceMatches(current, source))
  )
    return "Water Sport ya está activo para este Pokémon.";
  return null;
}
export function fieldPowerMultiplier(field: BattleField, type: string): number {
  return (
    (type === "electric" ? 0.5 ** (field.mudSport?.length ?? 0) : 1) *
    (type === "fire" ? 0.5 ** (field.waterSport?.length ?? 0) : 1)
  );
}
/** Residual Gen 3, sin habilidades/objetos ni estados de invulnerabilidad. */
export function weatherResidual(
  pokemon: Pokemon,
  weather: WeatherKind,
): number {
  const current = getCurrentHp(pokemon),
    max = getMaxHp(pokemon);
  if (current <= 0 || !max) return 0;
  const immune =
    weather === "sand"
      ? pokemon.types.some((t) => ["ground", "rock", "steel"].includes(t))
      : weather === "hail"
        ? pokemon.types.includes("ice")
        : true;
  return immune ? 0 : Math.min(current, Math.max(1, Math.floor(max / 16)));
}
