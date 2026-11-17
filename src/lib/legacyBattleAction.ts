import type { UnknownAction } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/store/store";
import { transactPvpParty } from "@/store/store";
import {
  getActiveAccountId,
  isLocalPartyMutationBlocked,
  pvpPartyRevision,
} from "@/store/accountStorage";
import partyReducer from "@/slices/partySlice";
import { combatKey } from "@/lib/emerald/types";

/** Legacy manual combat must save its KO, levels and monetary outbox before
 * subscribers may submit the reward. The regular wallet write guard remains. */
export function submitLegacyBattleAction(action: UnknownAction) {
  return async (
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    if (
      ![
        "party/executePokemonMove",
        "party/finishBattleTurn",
        "party/changeOpponentHp",
      ].includes(action.type)
    )
      throw new Error("La acción de combate manual no es válida.");
    const owner = getActiveAccountId();
    if (owner === null)
      throw new Error("Inicia sesión para guardar el combate.");
    const expected = combatKey(getState().party);
    await transactPvpParty(owner, async (latest) => {
      if (isLocalPartyMutationBlocked(latest) || combatKey(latest) !== expected)
        throw new Error(
          "El combate cambió o tiene una operación pendiente. Intenta nuevamente.",
        );
      const next = partyReducer(latest, action);
      return {
        party:
          next === latest
            ? latest
            : { ...next, pvpRevision: pvpPartyRevision(latest) + 1 },
        value: undefined,
      };
    });
  };
}
