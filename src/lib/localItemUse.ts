import type { PartyState } from "@/slices/partySlice";
import { transactPvpParty } from "@/store/store";
import {
  isLocalPartyMutationBlocked,
  pvpPartyRevision,
} from "@/store/accountStorage";
import { localBattleActive } from "@/lib/shop/wallet";
import { hasLivingHp } from "@/lib/pokemonCondition";
import {
  USABLE_ITEM_IDS,
  type LocalItemDebit,
  type UsableItemId,
} from "@/lib/shop/types";
import { validLocalItemOutbox } from "@/lib/shop/localItems";

/** Save the effect, one inventory debit and its durable synchronization intent
 * together. Background network retries never recompute the effect or its RNG. */
export function commitLocalItemUse(input: {
  userId: number;
  clientId: string;
  itemId: UsableItemId;
  captureId: string;
  moveId?: number;
  operationId?: string;
  plan: (latest: PartyState) => Promise<PartyState>;
}): Promise<void> {
  const operationId = input.operationId ?? crypto.randomUUID();
  return transactPvpParty(input.userId, async (party) => {
    const outbox =
      party.localItemOutbox?.clientId === input.clientId
        ? party.localItemOutbox
        : undefined;
    if (party.localItemOutbox?.operations.length && !outbox)
      throw new Error(
        "Recupera los consumos pendientes desde el navegador que los guardó.",
      );
    if (outbox?.operations.some((op) => op.operationId === operationId))
      return { party, value: undefined };
    if (
      !USABLE_ITEM_IDS.includes(input.itemId) ||
      !party.pokemons.some((capture) => capture.captureId === input.captureId)
    )
      throw new Error("El objeto o su Pokémon objetivo no son válidos.");
    if (isLocalPartyMutationBlocked(party))
      throw new Error(
        "Termina la batalla reservada o la operación pendiente antes de usar un objeto.",
      );
    const ack = party.bag?.consumptionAck;
    if (
      !ack ||
      ack.clientId !== input.clientId ||
      (outbox && outbox.clientId !== input.clientId)
    )
      throw new Error(
        "Conecta y sincroniza una vez este navegador antes de usar objetos.",
      );
    const stock = party.bag?.items?.[input.itemId] ?? 0;
    if (stock < 1)
      throw new Error("No tienes existencias de este objeto en tu Bag.");
    if (
      input.itemId === "full-restore" &&
      !hasLivingHp(
        party.pokemons.find((capture) => capture.captureId === input.captureId)?.pokemon,
      )
    )
      throw new Error("Full Restore no revive Pokémon debilitados. Usa Max Revive.");
    if (input.itemId === "rare-candy" && localBattleActive(party))
      throw new Error("Rare Candy sólo puede usarse fuera de combate.");
    const next = await input.plan(party);
    if (
      JSON.stringify(next.bag?.items ?? {}) !==
      JSON.stringify(party.bag?.items ?? {})
    )
      throw new Error(
        "El efecto del objeto no debe modificar las existencias directamente.",
      );
    const sequence = Math.max(
      outbox?.nextSequence ?? 1,
      ack.throughSequence + 1,
    );
    const operation: LocalItemDebit = {
      operationId,
      sequence,
      itemId: input.itemId,
      quantity: 1,
      captureId: input.captureId,
      context: localBattleActive(party) ? "local-battle" : "party",
      ...(input.moveId !== undefined ? { moveId: input.moveId } : {}),
    };
    const nextOutbox = {
      version: 1 as const,
      clientId: input.clientId,
      nextSequence: sequence + 1,
      operations: [...(outbox?.operations ?? []), operation],
    };
    if (!validLocalItemOutbox(nextOutbox))
      throw new Error("No se pudo guardar una secuencia válida de consumo.");
    return {
      party: {
        ...next,
        bag: {
          ...party.bag!,
          items: { ...party.bag?.items, [input.itemId]: stock - 1 },
        },
        localItemOutbox: nextOutbox,
        pvpRevision:
          Math.max(pvpPartyRevision(next), pvpPartyRevision(party)) + 1,
      },
      value: undefined,
    };
  });
}
