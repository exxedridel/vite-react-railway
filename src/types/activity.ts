import type { BattleResult } from "@/types/battle";

export type ActivityKind =
  | "starter"
  | "capture"
  | "release"
  | "level"
  | "hp"
  | "tm"
  | "learn"
  | "move"
  | "stages"
  | "status"
  | "opponent"
  | "reset";

export type ActivityEntry = {
  id: string;
  sequence: number;
  occurredAt: string;
  kind: ActivityKind;
  title: string;
  details: string[];
  captureId?: string;
  battle?: BattleResult;
};

export type ActivityDraft = Omit<
  ActivityEntry,
  "id" | "sequence" | "occurredAt"
>;
export type ActivityMeta = { id: string; occurredAt: string };
