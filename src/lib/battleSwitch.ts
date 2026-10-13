import type { CapturedPokemon } from "@/types/pokemon";
import type { BattleOpponent } from "./battleOpponent";
import { getBattleField, type BattleField } from "./battleField";
import { getCurrentHp } from "./pokemonStats";
export function pendingBattleSwitch(
  state: {
    pokemons: CapturedPokemon[];
    opponent: BattleOpponent | null;
    battleField?: BattleField;
  },
  captureId: string | null,
) {
  const field = getBattleField(state.battleField),
    previous = state.pokemons.find(
      (p) => p.captureId === field.activeCaptureId,
    ),
    next = state.pokemons.find((p) => p.captureId === captureId);
  if (
    !previous ||
    !next ||
    previous.captureId === next.captureId ||
    !state.opponent ||
    getCurrentHp(state.opponent.pokemon) <= 0
  )
    return null;
  return {
    previous,
    next,
    expectedContext: JSON.stringify([previous, next, state.opponent, field]),
  };
}
