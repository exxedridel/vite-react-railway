import type { PokemonMove } from "@/types/moves";
import type { PokemonStatus } from "@/types/pokemon";
import { GEN3_MOVE_DATA } from "./gen3MoveData";
export const CURATED_MOVE_CATALOG = GEN3_MOVE_DATA;
export function getCuratedMove(move: PokemonMove): PokemonMove {
  const entry = GEN3_MOVE_DATA[move.id];
  return entry
    ? { ...move, ...entry.parameters, description: entry.description }
    : move;
}
export function getMoveRequirementFailure(
  moveId: number,
  targetStatuses: readonly PokemonStatus[],
  ownStatuses: readonly PokemonStatus[] = [],
): string | null {
  const e = GEN3_MOVE_DATA[moveId];
  if (e?.sleepOnly && !ownStatuses.includes("asleep"))
    return `${e.name} falló: el usuario no está dormido (Asleep).`;
  if (e?.targetSleepOnly && !targetStatuses.includes("asleep"))
    return `${e.name} falló: el objetivo no está dormido (Asleep).`;
  return null;
}
export const SLEEP_TALK_EXCLUDED = new Set([
  13, 19, 76, 91, 117, 118, 119, 130, 143, 214, 253, 264, 274, 291, 340,
]);
export const NUMERIC_MOVE_INPUTS: Record<
  number,
  { label: string; min: number; max: number; step: number }
> = {
  67: { label: "Peso del objetivo (kg)", min: 0.1, max: 10000, step: 0.1 },
  216: { label: "Amistad del usuario", min: 0, max: 255, step: 1 },
  218: { label: "Amistad del usuario", min: 0, max: 255, step: 1 },
  210: {
    label: "Golpe consecutivo (incluyendo este)",
    min: 1,
    max: 5,
    step: 1,
  },
  205: {
    label: "Golpe consecutivo (incluyendo este)",
    min: 1,
    max: 5,
    step: 1,
  },
  301: {
    label: "Golpe consecutivo (incluyendo este)",
    min: 1,
    max: 5,
    step: 1,
  },
  255: {
    label: "Cargas Stockpile que vas a consumir",
    min: 1,
    max: 3,
    step: 1,
  },
  256: {
    label: "Cargas Stockpile que vas a consumir",
    min: 1,
    max: 3,
    step: 1,
  },
  68: {
    label: "Daño físico recibido este turno del objetivo",
    min: 1,
    max: 999999,
    step: 1,
  },
  243: {
    label: "Daño especial recibido este turno del objetivo",
    min: 1,
    max: 999999,
    step: 1,
  },
  117: { label: "Daño acumulado durante Bide", min: 1, max: 999999, step: 1 },
};
