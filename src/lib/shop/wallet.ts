import type { PartyState } from "@/slices/partySlice";
import { transactPvpParty } from "@/store/store";
import { getCurrentHp } from "@/lib/pokemonStats";
import { pvpPartyRevision } from "@/store/accountStorage";
import { SHOP_ITEM_IDS, type ShopPurchase, type Wallet } from "./types";

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown, min = 0): value is number =>
  Number.isSafeInteger(value) && Number(value) >= min;
export function validWallet(value: unknown): value is Wallet {
  if (
    !record(value) ||
    value.currencyVersion !== 1 ||
    !integer(value.userId, 1) ||
    !integer(value.balance) ||
    !integer(value.revision) ||
    !record(value.items)
  )
    return false;
  return Object.entries(value.items).every(
    ([item, quantity]) =>
      SHOP_ITEM_IDS.includes(item as (typeof SHOP_ITEM_IDS)[number]) &&
      integer(quantity),
  );
}
export function validPurchase(value: unknown): value is ShopPurchase {
  if (!record(value)) return false;
  return (
    ["purchaseId", "requestId", "clientId"].every(
      (key) =>
        typeof value[key] === "string" &&
        String(value[key]).length > 0 &&
        String(value[key]).length <= 128,
    ) &&
    integer(value.adminUserId, 1) &&
    integer(value.userId, 1) &&
    integer(value.quantity, 1) &&
    Number(value.quantity) <= 99 &&
    integer(value.unitPrice, 1) &&
    integer(value.total, 1) &&
    value.total === Number(value.quantity) * Number(value.unitPrice) &&
    integer(value.balanceBefore) &&
    integer(value.balanceAfter) &&
    value.balanceAfter === Number(value.balanceBefore) - Number(value.total) &&
    integer(value.walletRevision, 1) &&
    SHOP_ITEM_IDS.includes(value.itemId as (typeof SHOP_ITEM_IDS)[number]) &&
    ["pending", "applied"].includes(String(value.status))
  );
}

export function localBattleActive(party: PartyState): boolean {
  return (
    !!party.pvpLock ||
    !!(party.emerald && !party.emerald.ended) ||
    !!(party.opponent && getCurrentHp(party.opponent.pokemon) > 0)
  );
}

/** Canonical wallet snapshots replace only currency/items. Pokémon and badges
 * stay in the local party. Revision fencing prevents replays from restoring cash.
 */
export function partyWithWallet(party: PartyState, wallet: Wallet): PartyState {
  if (!validWallet(wallet)) throw new Error("El saldo recibido no es válido.");
  const current = party.bag;
  const sameOwner =
    current?.walletUserId === wallet.userId && current.currencyVersion === 1;
  if (sameOwner && typeof current.walletRevision === "number") {
    if (current.walletRevision > wallet.revision) return party;
    if (current.walletRevision === wallet.revision) {
      if (
        current.money !== wallet.balance ||
        !SHOP_ITEM_IDS.every(
          (id) => (current.items?.[id] ?? 0) === (wallet.items[id] ?? 0),
        )
      )
        throw new Error(
          "El saldo confirmado no coincide. Actualiza la conexión de Tienda.",
        );
      return party;
    }
  }
  return {
    ...party,
    pvpRevision: pvpPartyRevision(party) + 1,
    bag: {
      money: wallet.balance,
      badges: [...(party.bag?.badges ?? [])],
      items: { ...wallet.items },
      currencyVersion: 1,
      walletRevision: wallet.revision,
      walletUserId: wallet.userId,
    },
  };
}

export function applyShopWallet(
  wallet: Wallet,
  pendingRequestIds: string[] = [],
  proof: {
    appliedPurchases?: ShopPurchase[];
    abortUnlockRequestId?: string;
  } = {},
): Promise<void> {
  if (!validWallet(wallet))
    return Promise.reject(new Error("El saldo recibido no es válido."));
  return transactPvpParty(wallet.userId, async (party) => {
    if (
      party.bag?.walletUserId === wallet.userId &&
      (party.bag.walletRevision ?? -1) > wallet.revision
    )
      return { party, value: undefined };
    let next = partyWithWallet(party, wallet);
    const lock = next.shopLock;
    const confirmedApplied =
      lock &&
      lock.userId === wallet.userId &&
      proof.appliedPurchases?.some(
        (purchase) =>
          purchase.status === "applied" &&
          purchase.requestId === lock.requestId &&
          purchase.userId === wallet.userId &&
          purchase.clientId === lock.clientId &&
          purchase.walletRevision <= wallet.revision,
      );
    const confirmedAbort =
      lock &&
      lock.userId === wallet.userId &&
      proof.abortUnlockRequestId === lock.requestId &&
      !pendingRequestIds.includes(lock.requestId);
    if (lock && (confirmedApplied || confirmedAbort))
      next = {
        ...next,
        pvpRevision: pvpPartyRevision(next) + 1,
        shopLock: undefined,
      };
    return { party: next, value: undefined };
  });
}

export function prepareShopParty(
  userId: number,
  clientId: string,
  requestId: string,
  revision: number,
): Promise<number> {
  return transactPvpParty(userId, async (party) => {
    if (localBattleActive(party))
      throw new Error("El jugador está en batalla.");
    if (
      party.bag?.walletUserId !== userId ||
      party.bag.walletRevision !== revision
    )
      throw new Error("Actualiza el saldo antes de comprar.");
    if (
      party.shopLock &&
      (party.shopLock.requestId !== requestId ||
        party.shopLock.clientId !== clientId ||
        party.shopLock.userId !== userId)
    )
      throw new Error("Hay otra compra pendiente de confirmación.");
    return {
      party: party.shopLock
        ? party
        : {
            ...party,
            pvpRevision: pvpPartyRevision(party) + 1,
            shopLock: { userId, clientId, requestId },
          },
      value: revision,
    };
  });
}
