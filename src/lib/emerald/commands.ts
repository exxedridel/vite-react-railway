import { nanoid } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/store/store";
import { commitEmeraldAction } from "@/slices/partySlice";
import {
  combatKey,
  type BattleSide,
  type EmeraldChoice,
  type EmeraldUpdate,
} from "./types";
let inFlight = false;
/** Lazy-load the simulator only on the first battle action. Optimistic snapshot check
 * prevents stale asynchronous calculations from overwriting manual edits. */
export function submitEmeraldAction(
  captureId: string,
  side: BattleSide,
  choice: EmeraldChoice | "cancel",
) {
  return async (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    if (inFlight) throw new Error("Espera a que termine la acción actual.");
    inFlight = true;
    try {
      const state = getState().party;
      if (state.opponent?.kind !== "wild")
        throw new Error(
          "La automatización solo está disponible para encuentros salvajes.",
        );
      const expected = combatKey(state);
      const engine = await import("./engine");
      if (combatKey(getState().party) !== expected)
        throw new Error(
          "El combate cambió durante la carga. Intenta otra vez.",
        );
      const id = nanoid();
      const snapshot = {
        pokemons: state.pokemons,
        opponent: state.opponent,
        battleField: state.battleField,
        emerald: state.emerald,
      };
      let update: EmeraldUpdate;
      if (choice === "cancel")
        update = {
          ...engine.cancelEmeraldChoice(snapshot, side),
          results: [],
          events: [
            "Elección cancelada; no se aplicaron efectos ni se consumió turno.",
          ],
          completed: false,
        };
      else {
        const seed = Array.from(crypto.getRandomValues(new Uint16Array(4))) as [
          number,
          number,
          number,
          number,
        ];
        update = engine.runEmeraldAction(
          snapshot,
          captureId,
          side,
          choice,
          seed,
          id,
        );
      }
      dispatch(commitEmeraldAction({ expected, update, id }));
      if (getState().party.lastEmeraldBatch?.id !== id)
        throw new Error("La acción quedó desactualizada; no se aplicó.");
    } finally {
      inFlight = false;
    }
  };
}
