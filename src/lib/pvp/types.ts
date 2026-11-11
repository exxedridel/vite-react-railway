import type { ChatUser } from "@/lib/testMessages";
import type { CapturedPokemon, PokemonStatus } from "@/types/pokemon";
import type { EmeraldRequest } from "@/lib/emerald/types";
import type {
  TrainerBattleSession,
  TrainerSide,
  TrainerTeam,
} from "@/lib/trainerBattle/types";

export type PvpPhase =
  | "collecting"
  | "ready"
  | "active"
  | "finished"
  | "finalizing"
  | "finalized"
  | "cancelled";
export type PvpChoice =
  | { kind: "move"; moveId: number }
  | { kind: "switch"; captureId: string }
  | { kind: "wait" }
  | { kind: "cancel" }
  | { kind: "forfeit" };
export type PvpSnapshot = {
  version: 1;
  battleId: string;
  snapshotId: string;
  userId: number;
  clientId: string;
  dataVersion: string;
  baseHash: string;
  pokemons: CapturedPokemon[];
  activeCaptureId: string;
  hpMultiplier: number;
};
export type PvpPatch = {
  captureId: string;
  hp: number;
  statuses: PokemonStatus[];
  statusTurns: Record<string, number>;
};
export type PvpResult = {
  battleId: string;
  resultId: string;
  userId: number;
  snapshotId: string;
  baseHash: string;
  outcome: "win" | "lose" | "draw";
  patches: PvpPatch[];
};
export type PvpHost = {
  userId: number;
  clientId: string;
  epoch: number;
  online: boolean;
};
export type PvpPlayer = {
  user: ChatUser;
  clientId: string;
  online: boolean;
  snapshot?: PvpSnapshot;
};
export type PvpLobbyPlayer = {
  user: ChatUser;
  clientId: string;
  online: boolean;
  busy: boolean;
};
export type PvpCommand = {
  commandId: string;
  userId: number;
  side: TrainerSide;
  requestKey: string;
  choice: PvpChoice;
};
export type PvpBattleView = {
  battleId: string;
  phase: PvpPhase;
  revision: number;
  checkpointRevision: number;
  host: PvpHost;
  players: Record<TrainerSide, PvpPlayer>;
  applied: Record<TrainerSide, boolean>;
  session?: TrainerBattleSession | null;
  commands?: PvpCommand[];
  side?: TrainerSide;
  snapshot?: PvpSnapshot;
  team?: TrainerTeam;
  request?: EmeraldRequest;
  requestKey?: string;
  pending?: boolean;
  result?: PvpResult;
};
export type PvpError = { code: string; message: string };
export type PvpAck =
  | { ok: true; state: PvpBattleView | null; lobby?: PvpLobbyPlayer[] }
  | { ok: false; error: PvpError };

export function stablePvpJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object")
      return Object.fromEntries(
        Object.entries(input)
          .filter(([, item]) => item !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, item]) => [key, normalize(item)]),
      );
    return input;
  };
  return JSON.stringify(normalize(value));
}
export function pvpRequestKey(
  session: TrainerBattleSession,
  side: TrainerSide,
): string {
  if (!session.runtime) return "";
  return stablePvpJson([
    session.phase,
    session.runtime.turn,
    session.teams[side].activeCaptureId,
    session.runtime.requests[side],
    Boolean(session.runtime.pending[side]),
  ]);
}
