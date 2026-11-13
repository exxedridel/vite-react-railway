import { nanoid } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/store/store";
import partyReducer, {
  commitEmeraldAction,
  type PartyState,
} from "@/slices/partySlice";
import { transactPvpParty } from "@/store/store";
import { getActiveAccountId, pvpPartyRevision } from "@/store/accountStorage";
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
      if (choice !== "cancel" && choice.kind === "item")
        throw new Error(
          "Usa Full Restore desde tu Bag para confirmar sus existencias.",
        );
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
      const resolveAction = (latest: PartyState) => {
        if (combatKey(latest) !== expected)
          throw new Error(
            "El combate cambió antes de guardar la acción. Intenta de nuevo.",
          );
        if (
          latest.pvpLock ||
          latest.shopLock ||
          latest.resetLock ||
          latest.itemUseLock ||
          latest.centerLock
        )
          throw new Error(
            "La Party tiene una operación pendiente. Recupera su confirmación antes de actuar.",
          );
        const snapshot = {
          pokemons: latest.pokemons,
          opponent: latest.opponent,
          battleField: latest.battleField,
          emerald: latest.emerald,
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
          const seed = Array.from(
            crypto.getRandomValues(new Uint16Array(4)),
          ) as [number, number, number, number];
          update = engine.runEmeraldAction(
            snapshot,
            captureId,
            side,
            choice,
            seed,
            id,
          );
        }
        const next = partyReducer(
          latest,
          commitEmeraldAction({ expected, update, id }),
        );
        if (next.lastEmeraldBatch?.id !== id)
          throw new Error("La acción quedó desactualizada; no se aplicó.");
        return { ...next, pvpRevision: pvpPartyRevision(latest) + 1 };
      };
      const owner = getActiveAccountId();
      if (owner !== null) {
        await transactPvpParty(owner, async (latest) => ({
          party: resolveAction(latest),
          value: undefined,
        }));
      } else {
        throw new Error("Inicia sesión para guardar la acción de tu Party.");
      }
    } finally {
      inFlight = false;
    }
  };
}
