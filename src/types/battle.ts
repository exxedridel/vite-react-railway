export type BattleOutcome =
  | "hit"
  | "miss"
  | "immune"
  | "status"
  | "blocked"
  | "manual";
export type BattleResult = {
  attackStat?: "attack" | "special-attack";
  defenseStat?: "defense" | "special-defense";
  attackerBurned?: boolean;
  statusChanges?: {
    role: "attacker" | "target";
    name: string;
    status: import("./pokemon").PokemonStatus;
  }[];
  effectRolls?: {
    recipient: "attacker" | "target";
    name: string;
    chance: number;
    roll: number;
    statuses?: import("./pokemon").PokemonStatus[];
    stages?: Partial<Record<import("./pokemon").BattleStageName, number>>;
    selectedStatus?: import("./pokemon").PokemonStatus;
    hit: number;
    passed: boolean;
    applied: boolean;
  }[];
  damageType?: string;
  resolvedMoveId?: number;
  criticalMultiplier?: number;
  effectMessages?: string[];
  weatherMultiplier?: number;
  hits?: { damage: number; critical: boolean }[];
  crashDamage?: number;
  presentHealing?: boolean;
  executionOptions?: import("@/lib/moveCatalogTypes").MoveExecutionOptions;
  hpChanges?: {
    role: "attacker" | "target";
    name: string;
    before: number;
    after: number;
  }[];
  requestedHealing?: number;
  appliedHealing?: number;
  targetHpBefore?: number;
  targetHpAfter?: number;
  actorSide?: "player" | "opponent";
  id: string;
  captureId: string;
  attackerName: string;
  opponentName: string;
  moveName: string;
  moveId: number;
  outcome: BattleOutcome;
  message: string;
  hitChance: number | null;
  accuracyRoll: number | null;
  criticalChance: number;
  criticalRoll: number | null;
  critical: boolean;
  damage: number;
  appliedDamage: number;
  wildHpBefore: number | null;
  wildHpAfter: number | null;
  level: number;
  attack: number | null;
  defense: number | null;
  attackStage: number | null;
  defenseStage: number | null;
  baseDamage: number | null;
  stab: number;
  effectiveness: number;
  burn: number;
  manualEffect: string | null;
};
export type BattleRolls = {
  accuracy: number;
  critical: number;
  extra?: number[];
};
