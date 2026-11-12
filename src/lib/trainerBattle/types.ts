import type { CapturedPokemon } from "@/types/pokemon";
import type { BattleResult } from "@/types/battle";
import type { BattleField } from "@/lib/battleField";
import type { EmeraldChoice, EmeraldRequest } from "@/lib/emerald/types";

export type TrainerSide = "a" | "b";
export type TrainerChoice =
  | EmeraldChoice
  | { kind: "forfeit" }
  | { kind: "item"; item: "full-restore"; captureId: string };
export type TrainerPokemon = CapturedPokemon & {
  trainerStatusContext?: {
    disabledMoveId?: number;
    encoredMoveId?: number;
    gender?: "M" | "F";
  };
};
export type TrainerTeam = {
  name: string;
  pokemons: TrainerPokemon[];
  activeCaptureId: string | null;
};
export type TrainerRuntime = {
  engine: string;
  serial: number;
  turn: number;
  pending: Partial<Record<TrainerSide, TrainerChoice>>;
  requests: Record<TrainerSide, EmeraldRequest>;
  ended: boolean;
  winner: TrainerSide | "draw" | null;
};
export type TrainerTurnSummary = {
  id: string;
  turn: number;
  completed: boolean;
  results: BattleResult[];
  events: string[];
  highlights: string[];
};
export type TrainerBattleSession = {
  version: 1;
  id: string;
  networkBattleId?: string;
  networkItems?: {
    pending: Partial<
      Record<TrainerSide, { commandId: string; captureId: string }>
    >;
    used: string[];
  };
  phase: "setup" | "battle" | "finished";
  hpMultiplier: number;
  teams: Record<TrainerSide, TrainerTeam>;
  weather: BattleField["weather"];
  runtime: TrainerRuntime | null;
  history: TrainerTurnSummary[];
};
