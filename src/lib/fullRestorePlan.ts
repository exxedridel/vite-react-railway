import { nanoid } from "@reduxjs/toolkit";
import partyReducer, {
  applyFullRestoreToParty,
  applyTmToParty,
  commitEmeraldAction,
  type PartyState,
} from "@/slices/partySlice";
import { getCurrentHp, getMaxHp, isLeveled } from "@/lib/pokemonStats";
import { combatKey } from "@/lib/emerald/types";
import { emptyBattleField } from "@/lib/battleField";
import type { ConsumableItemId } from "@/lib/shop/types";
import { getCurrentMovePp, getMaxMovePp, restoreMovePp } from "@/lib/movePp";
import type { PokemonMove } from "@/types/moves";
import { localBattleActive } from "@/lib/shop/wallet";

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
export async function preparePartyItem(
  input: PartyState,
  captureId: string,
  itemId: ConsumableItemId,
  moveId?: number,
): Promise<PartyState> {
  if (input.pvpLock || input.shopLock || input.resetLock || input.itemUseLock)
    throw new Error(
      "La Party tiene una batalla u operación pendiente. Recupérala antes de usar un objeto.",
    );
  const target = input.pokemons.find(
    (capture) => capture.captureId === captureId,
  );
  if (!target || !isLeveled(target.pokemon))
    throw new Error("Elige un Pokémon válido de tu equipo.");
  if (
    itemId === "max-ether"
      ? !target.moves?.some((move) => move.id === moveId)
      : moveId !== undefined
  )
    throw new Error("Elige un movimiento válido del Pokémon para Max Ether.");
  const needsItem =
    itemId === "full-restore"
      ? needsFullRestore(input, captureId)
      : target.moves?.some(
          (move) =>
            (itemId === "max-elixir" ||
              (itemId === "max-ether" && move.id === moveId)) &&
            getCurrentMovePp(move) < getMaxMovePp(move),
        );
  if (!needsItem)
    throw new Error(
      itemId === "full-restore"
        ? "Este Pokémon no necesita Full Restore."
        : "El objeto no tendría efecto en el Pokémon o movimiento elegido.",
    );
  const state = JSON.parse(JSON.stringify(input)) as PartyState;
  const inBattle =
    !!state.opponent &&
    getCurrentHp(state.opponent.pokemon) > 0 &&
    !state.emerald?.ended;
  const applyItem = (): PartyState =>
    itemId === "full-restore"
      ? applyFullRestoreToParty(state, captureId)
      : {
          ...state,
          pokemons: state.pokemons.map((capture) =>
            capture.captureId !== captureId
              ? capture
              : {
                  ...capture,
                  moves: capture.moves?.map((move) =>
                    itemId === "max-elixir" || move.id === moveId
                      ? restoreMovePp(move)
                      : move,
                  ),
                },
          ),
        };
  if (!inBattle) return applyItem();
  if (state.opponent?.kind === "wild") {
    const native = await loadFullRestoreEngine();
    const active =
      state.pokemons.find(
        (capture) => capture.captureId === state.battleField?.activeCaptureId,
      ) ?? state.pokemons.find((capture) => getCurrentHp(capture.pokemon) > 0);
    if (!active || getCurrentHp(active.pokemon) <= 0)
      throw new Error(
        "Elige el reemplazo obligatorio antes de usar un objeto.",
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
      {
        kind: "item",
        item: itemId,
        captureId,
        ...(moveId !== undefined ? { moveId } : {}),
      },
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
      "Ya utilizaste la acción de este turno. Finaliza el turno antes de usar otro objeto.",
    );
  const active =
    state.pokemons.find(
      (capture) => capture.captureId === field.activeCaptureId,
    ) ?? target;
  if (getCurrentHp(active.pokemon) <= 0)
    throw new Error("Elige el reemplazo obligatorio antes de usar un objeto.");
  const restored = applyItem();
  return {
    ...restored,
    battleField: {
      ...field,
      activeCaptureId: active.captureId,
      playerItemUsedThisTurn: true,
    },
  };
}

export const prepareBattleItemParty = preparePartyItem;
export function prepareFullRestoreParty(
  input: PartyState,
  captureId: string,
): Promise<PartyState> {
  return preparePartyItem(input, captureId, "full-restore");
}

/** A TM plan is persisted before any stock is debited. It never changes Bag. */
export async function prepareTmParty(
  input: PartyState,
  captureId: string,
  move: PokemonMove,
  replaceMoveId?: number,
): Promise<PartyState> {
  if (input.pvpLock || input.shopLock || input.resetLock || input.itemUseLock)
    throw new Error(
      "La Party tiene una batalla u operación pendiente. Recupérala antes de usar una TM.",
    );
  if (localBattleActive(input))
    throw new Error("Las TM sólo pueden usarse fuera de combate.");
  const target = input.pokemons.find(
    (capture) => capture.captureId === captureId,
  );
  if (!target || !isLeveled(target.pokemon))
    throw new Error("Elige un Pokémon válido de tu equipo.");
  const next = applyTmToParty(input, {
    captureId,
    move,
    ...(replaceMoveId === undefined ? {} : { replaceMoveId }),
  });
  if (
    next === input ||
    !next.pokemons
      .find((capture) => capture.captureId === captureId)
      ?.moves?.some((learned) => learned.id === move.id)
  )
    throw new Error(
      "No se pudo aprender el movimiento. Revisa la compatibilidad y los espacios disponibles.",
    );
  return next;
}
