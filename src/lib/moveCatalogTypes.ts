import type { PokemonMove } from "@/types/moves";
import type { PokemonStatus, BattleStageName } from "@/types/pokemon";
export type MoveEffect = {
  chance: number;
  recipient: "attacker" | "target";
  status?: PokemonStatus;
  stages?: Partial<Record<BattleStageName, number>>;
  randomStatus?: PokemonStatus[];
};
export type CuratedMove = {
  id: number;
  name: string;
  revision: 2;
  automation: "automatic" | "assisted" | "manual";
  description: string;
  notes: string[];
  parameters: Pick<
    PokemonMove,
    "type" | "damageClass" | "power" | "accuracy" | "pp" | "priority"
  >;
  target: string;
  critStage: number;
  effects: MoveEffect[];
  drain?: number[];
  recoil?: number[];
  heal?: number[];
  multihit?: number | number[];
  selfDestruct?: "always" | "ifHit";
  preparation?: string;
  confirmation?: string;
  sleepOnly?: boolean;
  targetSleepOnly?: boolean;
  handler?: string;
  manualReason?: string;
};
export type MoveExecutionOptions = {
  preparationConfirmed?: boolean;
  specialConditionConfirmed?: boolean;
  targetHasActed?: boolean;
  weather?: "none" | "sun" | "rain" | "sand" | "hail";
  numericValue?: number;
  powerBoostConfirmed?: boolean;
};
