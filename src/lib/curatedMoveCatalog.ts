import { MOVE_COMBAT_RULES, type MoveCombatRule } from "@/lib/moveCombatRules";
import type { PokemonMove } from "@/types/moves";
import type { PokemonStatus } from "@/types/pokemon";

/** Solo los movimientos auditados entran aquí; los demás conservan sus reglas. */
export type CuratedMove = {
  revision: number;
  description: string;
  parameters: Pick<PokemonMove, "type" | "damageClass" | "power" | "accuracy">;
  requirements: readonly {
    kind: "target-status";
    status: PokemonStatus;
    failure: string;
  }[];
  afterDamage: readonly {
    kind: "drain";
    numerator: number;
    denominator: number;
  }[];
};
export const CURATED_MOVE_CATALOG: Readonly<
  Partial<Record<number, CuratedMove>>
> = {
  138: {
    revision: 1,
    description:
      "Dream Eater: ataque especial Psíquico de potencia 100 y precisión base 100%. Solo funciona si el objetivo está dormido (Asleep); en caso contrario falla. Si acierta, resta HP al objetivo y recupera la mitad de los HP realmente perdidos, sin superar tu HP máximo. La curación se redondea hacia abajo, con mínimo 1 si hubo daño. No despierta al objetivo. Accuracy y Evasiveness afectan el acierto.",
    parameters: {
      type: "psychic",
      damageClass: "special",
      power: 100,
      accuracy: 100,
    },
    requirements: [
      {
        kind: "target-status",
        status: "asleep",
        failure: "Dream Eater falló: el objetivo no está dormido (Asleep).",
      },
    ],
    afterDamage: [{ kind: "drain", numerator: 1, denominator: 2 }],
  },
};
export function getCuratedMove(move: PokemonMove): PokemonMove {
  const entry = CURATED_MOVE_CATALOG[move.id];
  return entry
    ? { ...move, ...entry.parameters, description: entry.description }
    : move;
}
export function getCombatRule(move: PokemonMove): MoveCombatRule | undefined {
  const entry = CURATED_MOVE_CATALOG[move.id];
  if (!entry) return MOVE_COMBAT_RULES[move.id];
  return {
    name: move.name,
    mode: "damage",
    category: entry.parameters.damageClass,
    type: entry.parameters.type,
    power: entry.parameters.power,
    target: "normal",
    critStage: 0,
    alwaysCrit: false,
    noCrit: false,
    alwaysHit: false,
    ignoreAccuracy: false,
    ignoreEvasion: false,
    powder: false,
    status: null,
    typeImmunity: false,
    hasExtraEffect: false,
  };
}
export function getMoveRequirementFailure(
  moveId: number,
  targetStatuses: readonly PokemonStatus[],
): string | null {
  for (const requirement of CURATED_MOVE_CATALOG[moveId]?.requirements ?? []) {
    if (
      requirement.kind === "target-status" &&
      !targetStatuses.includes(requirement.status)
    )
      return requirement.failure;
  }
  return null;
}
