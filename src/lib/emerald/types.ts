import type { PartyState } from "@/slices/partySlice";
import type { BattleResult } from "@/types/battle";
export type BattleSide = "player" | "opponent";
export type EmeraldChoice =
  | { kind: "move"; moveId: number }
  | { kind: "switch"; captureId: string }
  | { kind: "wait" };
export type EmeraldRequest = {
  moves: {
    id: number;
    name: string;
    pp: number;
    maxpp: number;
    disabled: boolean;
  }[];
  forceSwitch: boolean;
  waiting: boolean;
  locked: boolean;
  trapped: boolean;
  gender: string;
  semiInvulnerable?: "dig" | "fly" | "dive" | "bounce";
};
export type EmeraldRuntime = {
  version: 1;
  encounterKey: string;
  engine: string;
  mirror: string;
  pending: Partial<Record<BattleSide, EmeraldChoice>>;
  requests: Record<BattleSide, EmeraldRequest>;
  ended: boolean;
  events: string[];
  serial: number;
};
export type CombatState = Pick<
  PartyState,
  "pokemons" | "opponent" | "battleField" | "emerald"
>;
export type EmeraldUpdate = CombatState & {
  results: BattleResult[];
  events: string[];
  completed: boolean;
};
export function combatKey(state: CombatState): string {
  return JSON.stringify([
    state.pokemons,
    state.opponent,
    state.battleField,
    state.emerald,
  ]);
}
export function encounterKey(state: CombatState): string {
  return JSON.stringify([
    state.opponent?.encounterId,
    state.opponent?.kind,
    state.opponent?.pokemon.id,
  ]);
}
