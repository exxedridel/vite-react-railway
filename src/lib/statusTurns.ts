import {
  STATUS_OPTIONS,
  type Pokemon,
  type PokemonStatus,
} from "@/types/pokemon";
export const TIMED_STATUSES = [
  "asleep",
  "confused",
  "taunted",
  "bound",
  "disabled",
  "encored",
  "perish-song",
] as const;
export type TimedStatus = (typeof TIMED_STATUSES)[number];
export type StatusTurns = Partial<Record<TimedStatus, number>>;
export type StatusCarrier = {
  statuses?: PokemonStatus[];
  statusTurns?: StatusTurns;
};
export const isTimedStatus = (status: PokemonStatus): status is TimedStatus =>
  (TIMED_STATUSES as readonly string[]).includes(status);
export const validTurns = (turns: number) =>
  Number.isInteger(turns) && turns >= 1 && turns <= 6;
export function withCleanStatusTurns<T extends StatusCarrier>(value: T): T {
  const current = value.statusTurns;
  if (!current) return value;
  const next: StatusTurns = {};
  for (const status of TIMED_STATUSES) {
    const count = current[status];
    if (
      value.statuses?.includes(status) &&
      count !== undefined &&
      validTurns(count)
    )
      next[status] = count;
  }
  return JSON.stringify(current) === JSON.stringify(next)
    ? value
    : { ...value, statusTurns: next };
}
export function assignStatusTurns(
  target: StatusCarrier,
  status: PokemonStatus,
  turns: number,
): void {
  if (!isTimedStatus(status) || !validTurns(turns)) return;
  let statuses = target.statuses ?? [];
  if (STATUS_OPTIONS.find((s) => s.id === status)?.group === "primary")
    statuses = statuses.filter(
      (s) => STATUS_OPTIONS.find((o) => o.id === s)?.group !== "primary",
    );
  target.statuses = Array.from(new Set([...statuses, status]));
  target.statusTurns = {
    ...withCleanStatusTurns(target).statusTurns,
    [status]: turns,
  };
}
export function tickStatusTurns(
  target: StatusCarrier & { pokemon?: Pokemon },
  name: string,
): string[] {
  const details: string[] = [];
  for (const status of TIMED_STATUSES) {
    const before = target.statusTurns?.[status];
    if (
      !target.statuses?.includes(status) ||
      before === undefined ||
      !validTurns(before)
    )
      continue;
    const left = before - 1;
    const label = STATUS_OPTIONS.find((s) => s.id === status)!.label;
    if (left === 0) {
      target.statuses = target.statuses.filter((s) => s !== status);
      delete target.statusTurns![status];
      if (status === "perish-song" && target.pokemon) {
        const hp = target.pokemon.stats.find((stat) => stat.name === "hp");
        if (hp && hp.value > 0) {
          const before = hp.value;
          hp.value = 0;
          details.push(`${name}: Perish Song, HP ${before} → 0.`);
        }
      }
      details.push(`${name}: ${label} terminó (0 turnos).`);
    } else {
      target.statusTurns![status] = left;
      details.push(`${name}: ${label} ${before} → ${left} turnos.`);
    }
  }
  return details;
}
export function clearSecondaryStatuses(target: StatusCarrier): void {
  target.statuses = (target.statuses ?? []).filter(
    (s) => STATUS_OPTIONS.find((o) => o.id === s)?.group === "primary",
  );
  target.statusTurns = withCleanStatusTurns(target).statusTurns ?? {};
}
