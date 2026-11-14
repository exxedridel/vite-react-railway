import type { AppDispatch, RootState } from "@/store/store";
import { transactPvpParty } from "@/store/store";
import {
  getActiveAccountId,
  isLocalPartyMutationBlocked,
  pvpPartyRevision,
} from "@/store/accountStorage";
import partyReducer, { setBattleOpponent } from "@/slices/partySlice";
import type { BattleOpponent } from "@/lib/battleOpponent";
import { combatKey } from "@/lib/emerald/types";

/** Encounter creation must wait behind wallet reconciliation instead of losing
 * a raw dispatch to its temporary write guard. Success means the exact new
 * encounter has passed the lock checks and a checked account write. */
export function prepareLocalEncounter(opponent: BattleOpponent) {
  return async (
    _dispatch: AppDispatch,
    getState: () => RootState,
  ): Promise<void> => {
    const owner = getActiveAccountId();
    if (owner === null)
      throw new Error("Inicia sesión para guardar el nuevo encuentro.");
    if (!opponent.encounterId)
      throw new Error("El nuevo encuentro no tiene una identidad válida.");
    const expected = combatKey(getState().party);
    await transactPvpParty(owner, async (latest) => {
      if (combatKey(latest) !== expected)
        throw new Error(
          "El combate cambió mientras se preparaba el rival. Intenta nuevamente.",
        );
      if (isLocalPartyMutationBlocked(latest))
        throw new Error(
          "La Party tiene una operación o sincronización pendiente. Recupérala antes de iniciar el encuentro.",
        );
      const next = partyReducer(latest, setBattleOpponent(opponent));
      if (
        next === latest ||
        next.opponent?.encounterId !== opponent.encounterId
      )
        throw new Error(
          "No se pudo preparar este rival con la configuración actual de tu partida.",
        );
      return {
        party: { ...next, pvpRevision: pvpPartyRevision(latest) + 1 },
        value: undefined,
      };
    });
  };
}
