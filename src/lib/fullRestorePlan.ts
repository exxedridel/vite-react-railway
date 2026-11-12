import { nanoid } from "@reduxjs/toolkit";
import partyReducer, {
  applyFullRestoreToParty,
  commitEmeraldAction,
  type PartyState,
} from "@/slices/partySlice";
import { getCurrentHp, getMaxHp, isLeveled } from "@/lib/pokemonStats";
import { combatKey } from "@/lib/emerald/types";
import { emptyBattleField } from "@/lib/battleField";

type Engine = typeof import("@/lib/emerald/engine");
let engine: Promise<Engine> | undefined;
/** Preload before acquiring the storage lock when the encounter is wild. */
export function loadFullRestoreEngine(): Promise<Engine> {
  return (engine ??= import("@/lib/emerald/engine").catch((error) => {
    engine = undefined;
    throw error;
  }));
}

export function needsFullRestore(
  state: PartyState,
  captureId: string,
): boolean {
  const target = state.pokemons.find(
    (capture) => capture.captureId === captureId,
  );
  if (!target || !isLeveled(target.pokemon)) return false;
  const max = getMaxHp(target.pokemon);
  return (
    max !== undefined &&
    (getCurrentHp(target.pokemon) < max ||
      !!target.statuses?.length ||
      !!Object.keys(target.statusTurns ?? {}).length ||
      Object.values(target.pokemon.battleStages ?? {}).some(
        (value) => value !== 0,
      ))
  );
}

/** Pure inventory-use draft. The caller persists it before requesting the
 * server debit, then commits this exact draft once. Bag is never modified here. */
export async function prepareFullRestoreParty(
  input: PartyState,
  captureId: string,
): Promise<PartyState> {
  if (input.pvpLock || input.shopLock || input.resetLock || input.itemUseLock)
    throw new Error(
      "La Party tiene una batalla u operación pendiente. Recupérala antes de usar Full Restore.",
    );
  const target = input.pokemons.find(
    (capture) => capture.captureId === captureId,
  );
  if (!target || !isLeveled(target.pokemon))
    throw new Error("Elige un Pokémon válido de tu equipo.");
  if (!needsFullRestore(input, captureId))
    throw new Error("Este Pokémon no necesita Full Restore.");
  const state = JSON.parse(JSON.stringify(input)) as PartyState;
  const inBattle =
    !!state.opponent &&
    getCurrentHp(state.opponent.pokemon) > 0 &&
    !state.emerald?.ended;
  if (!inBattle) return applyFullRestoreToParty(state, captureId);
  if (state.opponent?.kind === "wild") {
    const native = await loadFullRestoreEngine();
    const active =
      state.pokemons.find(
        (capture) => capture.captureId === state.battleField?.activeCaptureId,
      ) ?? state.pokemons.find((capture) => getCurrentHp(capture.pokemon) > 0);
    if (!active || getCurrentHp(active.pokemon) <= 0)
      throw new Error(
        "Elige el reemplazo obligatorio antes de usar Full Restore.",
      );
    const seed = Array.from(crypto.getRandomValues(new Uint16Array(4))) as [
      number,
      number,
      number,
      number,
    ];
    const id = nanoid();
    const update = native.runEmeraldAction(
      state,
      active.captureId,
      "player",
      { kind: "item", item: "full-restore", captureId },
      seed,
      id,
    );
    return partyReducer(
      state,
      commitEmeraldAction({ expected: combatKey(state), update, id }),
    );
  }
  const field = state.battleField ?? emptyBattleField();
  if (field.playerSwitchedThisTurn || field.playerItemUsedThisTurn)
    throw new Error(
      "Ya utilizaste la acción de este turno. Finaliza el turno antes de usar Full Restore.",
    );
  const active =
    state.pokemons.find(
      (capture) => capture.captureId === field.activeCaptureId,
    ) ?? target;
  if (getCurrentHp(active.pokemon) <= 0)
    throw new Error(
      "Elige el reemplazo obligatorio antes de usar Full Restore.",
    );
  const restored = applyFullRestoreToParty(state, captureId);
  return {
    ...restored,
    battleField: {
      ...field,
      activeCaptureId: active.captureId,
      playerItemUsedThisTurn: true,
    },
  };
}
