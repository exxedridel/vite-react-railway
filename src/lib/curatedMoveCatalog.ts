import type { PokemonMove } from "@/types/moves";
import type { PokemonStatus } from "@/types/pokemon";
import { GEN3_MOVE_DATA } from "./gen3MoveData";
const FIELD_DESCRIPTIONS: Record<number, string> = {
  241: "Activa Sunny Day durante 5 turnos. Fire ×1.5, Water ×0.5; Solar Beam sin carga; Thunder 50% base; modifica Weather Ball y la recuperación según clima.",
  240: "Activa Rain Dance durante 5 turnos. Water ×1.5, Fire ×0.5; Thunder no falla por precisión; modifica Solar Beam, Weather Ball y la recuperación según clima.",
  201: "Activa Sandstorm durante 5 turnos. Al finalizar cada turno resta 1/16 del HP máximo, salvo tipos Rock, Ground o Steel. En Gen 3 no aumenta Special Defense de Rock.",
  258: "Activa Hail durante 5 turnos. Al finalizar cada turno resta 1/16 del HP máximo salvo tipos Ice. En Gen 3 no hace que Blizzard acierte siempre.",
  300: "Activa Mud Sport: reduce a la mitad la potencia Electric de ambos combatientes mientras el usuario siga en combate. Se combina con el clima.",
  346: "Activa Water Sport: reduce a la mitad la potencia Fire de ambos combatientes mientras el usuario siga en combate. Se combina con el clima.",
};
export const CURATED_MOVE_CATALOG: typeof GEN3_MOVE_DATA = {
  ...GEN3_MOVE_DATA,
  ...Object.fromEntries(
    Object.entries(FIELD_DESCRIPTIONS).map(([id, description]) => [
      id,
      {
        ...GEN3_MOVE_DATA[Number(id)],
        automation: "automatic",
        handler: "field",
        effects: [],
        notes: [],
        manualReason: undefined,
        description,
      },
    ]),
  ),
};
export function getCuratedMove(move: PokemonMove): PokemonMove {
  const entry = CURATED_MOVE_CATALOG[move.id];
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
