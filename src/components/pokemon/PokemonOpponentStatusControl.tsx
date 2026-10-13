import {
  assignStatusTurns,
  withCleanStatusTurns,
  type TimedStatus,
} from "@/lib/statusTurns";
import type { Dispatch, SetStateAction } from "react";
import { STATUS_OPTIONS, type PokemonStatus } from "@/types/pokemon";
import type { BattleOpponent } from "@/lib/battleOpponent";
import PokemonStatusPicker from "./PokemonStatusPicker";
export default function PokemonOpponentStatusControl({
  opponent,
  onChange,
}: {
  opponent: BattleOpponent;
  onChange: Dispatch<SetStateAction<BattleOpponent | null>>;
}) {
  function change(status?: PokemonStatus) {
    onChange((current) => {
      if (
        !current ||
        current.pokemon.id !== opponent.pokemon.id ||
        current.encounterId !== opponent.encounterId ||
        current.kind !== opponent.kind
      )
        return current;
      if (!status) return { ...current, statuses: [], statusTurns: {} };
      const existing = current.statuses ?? [];
      if (existing.includes(status))
        return withCleanStatusTurns({
          ...current,
          statuses: existing.filter((s) => s !== status),
        });
      const primary =
        STATUS_OPTIONS.find((s) => s.id === status)?.group === "primary";
      return {
        ...current,
        statuses: [
          ...existing.filter(
            (s) =>
              !primary ||
              STATUS_OPTIONS.find((o) => o.id === s)?.group !== "primary",
          ),
          status,
        ],
      };
    });
  }
  function setTurns(status: TimedStatus, turns: number) {
    onChange((current) => {
      if (
        !current ||
        current.pokemon.id !== opponent.pokemon.id ||
        current.encounterId !== opponent.encounterId ||
        current.kind !== opponent.kind
      )
        return current;
      const next = {
        ...current,
        statuses: [...(current.statuses ?? [])],
        statusTurns: { ...current.statusTurns },
      };
      assignStatusTurns(next, status, turns);
      return next;
    });
  }
  return (
    <PokemonStatusPicker
      name={opponent.pokemon.name}
      statuses={opponent.statuses ?? []}
      statusTurns={opponent.statusTurns}
      onSetTurns={setTurns}
      onToggle={change}
      onClear={() => change()}
    />
  );
}
