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
  | { kind: "item"; item: "full-restore"; captureId: string }
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
  inventoryAuthorized?: true;
};
export type PvpTrainer = {
  presetId: string;
  region: "kanto";
  name?: string;
  // Only the administrator needs the preset team. Player views keep the
  // opponent's full party private, just as in a battle against another user.
  team?: TrainerTeam;
};
export type PvpBattleView = {
  battleId: string;
  mode?: "pvp" | "trainer";
  trainer?: PvpTrainer;
  phase: PvpPhase;
  revision: number;
  checkpointRevision: number;
  host: PvpHost;
  players: { a: PvpPlayer; b?: PvpPlayer };
  applied: Record<TrainerSide, boolean>;
  session?: TrainerBattleSession | null;
  commands?: PvpCommand[];
  inventory?: Partial<Record<TrainerSide, number>>;
  side?: TrainerSide;
  snapshot?: PvpSnapshot;
  team?: TrainerTeam;
  request?: EmeraldRequest;
  requestKey?: string;
  pending?: boolean;
  result?: PvpResult;
};

export function isTrainerBattle(
  state: PvpBattleView | null | undefined,
): boolean {
  return state?.mode === "trainer";
}

export function pvpPlayersOnline(
  state: PvpBattleView | null | undefined,
): boolean {
  return (
    !!state?.players.a.online &&
    (isTrainerBattle(state) || !!state.players.b?.online)
  );
}
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
