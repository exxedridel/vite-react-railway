import partyReducer, { resetGame, type PartyState } from "@/slices/partySlice";
import { transactPvpParty } from "@/store/store";
import { getCurrentHp } from "@/lib/pokemonStats";
import { pvpPartyRevision } from "@/store/accountStorage";
import {
  SHOP_ITEM_IDS,
  type BalanceAdjustment,
  type ShopCatalog,
  type GameReset,
  type ShopPurchase,
  type Wallet,
} from "./types";

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
    integer(value.unitPrice) &&
    integer(value.total) &&
    value.total === Number(value.quantity) * Number(value.unitPrice) &&
    integer(value.balanceBefore) &&
    integer(value.balanceAfter) &&
    value.balanceAfter === Number(value.balanceBefore) - Number(value.total) &&
    integer(value.walletRevision, 1) &&
    SHOP_ITEM_IDS.includes(value.itemId as (typeof SHOP_ITEM_IDS)[number]) &&
    ["pending", "applied"].includes(String(value.status))
  );
}

export function validShopCatalog(value: unknown): value is ShopCatalog {
  return (
    record(value) &&
    integer(value.revision) &&
    (value.captureDifficulty === undefined ||
      (integer(value.captureDifficulty) &&
        Number(value.captureDifficulty) <= 20)) &&
    record(value.prices) &&
    Object.keys(value.prices).length === SHOP_ITEM_IDS.length &&
    SHOP_ITEM_IDS.every(
      (item) =>
        integer((value.prices as Record<string, unknown>)[item]) &&
        Number((value.prices as Record<string, unknown>)[item]) <=
          Math.floor(Number.MAX_SAFE_INTEGER / 99),
    )
  );
}

export function validBalanceAdjustment(
  value: unknown,
): value is BalanceAdjustment {
  if (!record(value)) return false;
  return (
    ["adjustmentId", "requestId", "clientId"].every(
      (key) =>
        typeof value[key] === "string" &&
        /^[\w.:-]{1,128}$/.test(String(value[key])),
    ) &&
    integer(value.adminUserId, 1) &&
    integer(value.userId, 1) &&
    Number.isSafeInteger(value.delta) &&
    value.delta !== 0 &&
    integer(value.balanceBefore) &&
    integer(value.balanceAfter) &&
    Number.isSafeInteger(Number(value.balanceBefore) + Number(value.delta)) &&
    value.balanceAfter === Number(value.balanceBefore) + Number(value.delta) &&
    integer(value.walletRevision, 1) &&
    ["pending", "applied", "cancelled"].includes(String(value.status)) &&
    (value.status === "cancelled"
      ? integer(value.cancelledWalletRevision, 1) &&
        value.cancelledWalletRevision === Number(value.walletRevision) + 1 &&
        value.cancelledBalance === value.balanceBefore
      : value.cancelledWalletRevision === undefined &&
        value.cancelledBalance === undefined)
  );
}

export function validGameReset(value: unknown): value is GameReset {
  return (
    record(value) &&
    typeof value.requestId === "string" &&
    /^[\w.:-]{1,128}$/.test(value.requestId) &&
    typeof value.clientId === "string" &&
    /^[\w.:-]{1,128}$/.test(value.clientId) &&
    integer(value.userId, 1) &&
    integer(value.walletRevision) &&
    ["pending", "applied", "cancelled"].includes(String(value.status)) &&
    (value.status === "cancelled" || Number(value.walletRevision) >= 1)
  );
}

export function localBattleActive(party: PartyState): boolean {
  return (
    !!party.captureAttempt ||
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
    // A reset wallet must arrive together with its matching reset receipt.
    // Cache/presence responses cannot advance the wallet before the party reset.
    if (
      party.resetLock &&
      party.resetLock.appliedWalletRevision === undefined &&
      wallet.revision > party.resetLock.expectedWalletRevision
    )
      return { party, value: undefined };
    if (
      party.itemUseLock &&
      party.itemUseLock.appliedWalletRevision === undefined &&
      wallet.revision > party.itemUseLock.expectedWalletRevision
    )
      return { party, value: undefined };
    if (
      party.shopLock?.operation === "balance-adjustment" &&
      party.shopLock.appliedWalletRevision === undefined &&
      wallet.revision > party.shopLock.expectedWalletRevision!
    )
      return { party, value: undefined };
    let next = partyWithWallet(party, wallet);
    const lock = next.shopLock;
    const confirmedApplied =
      lock &&
      lock.operation === undefined &&
      lock.userId === wallet.userId &&
      lock.appliedWalletRevision === undefined &&
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
      lock.appliedWalletRevision === undefined &&
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
  operation?: "balance-adjustment",
): Promise<number> {
  return transactPvpParty(userId, async (party) => {
    if (
      party.resetLock ||
      party.itemUseLock ||
      party.centerLock ||
      party.captureAttempt
    )
      throw new Error("Hay un reinicio de partida pendiente de confirmación.");
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
        party.shopLock.userId !== userId ||
        party.shopLock.operation !== operation ||
        (operation === "balance-adjustment" &&
          party.shopLock.expectedWalletRevision !== revision))
    )
      throw new Error("Hay otra compra pendiente de confirmación.");
    return {
      party: party.shopLock
        ? party
        : {
            ...party,
            pvpRevision: pvpPartyRevision(party) + 1,
            shopLock: {
              userId,
              clientId,
              requestId,
              ...(operation === "balance-adjustment"
                ? { operation, expectedWalletRevision: revision }
                : {}),
            },
          },
      value: revision,
    };
  });
}

/** Store the exact authoritative balance change before acknowledging it. The
 * marker prevents a replay or an abort barrier from releasing an applied use. */
export function applyBalanceAdjustment(
  wallet: Wallet,
  receipt: BalanceAdjustment,
  clientId: string,
): Promise<"pending" | "applied" | "cancelled" | "ignored"> {
  if (
    !validWallet(wallet) ||
    !validBalanceAdjustment(receipt) ||
    receipt.userId !== wallet.userId
  )
    return Promise.reject(
      new Error("El ajuste de Pokedollars recibido no es válido."),
    );
  return transactPvpParty(wallet.userId, async (party) => {
    if (receipt.clientId !== clientId && receipt.status === "pending")
      return { party, value: "ignored" as const };
    const lock = party.shopLock;
    const matches =
      !!lock &&
      lock.userId === wallet.userId &&
      lock.clientId === receipt.clientId &&
      lock.requestId === receipt.requestId;
    const terminalRevision =
      receipt.status === "cancelled"
        ? receipt.cancelledWalletRevision!
        : receipt.walletRevision;
    if (
      (party.bag?.walletRevision ?? -1) > wallet.revision ||
      terminalRevision > wallet.revision
    )
      return { party, value: "ignored" as const };
    if (
      receipt.status === "pending" &&
      receipt.walletRevision <= (party.balanceAdjustmentRevision ?? 0)
    )
      return { party, value: "ignored" as const };
    if (
      (lock && !matches) ||
      party.pvpLock ||
      party.resetLock ||
      party.itemUseLock ||
      party.centerLock ||
      party.captureAttempt
    )
      throw new Error(
        "La Party conserva otra operación. Recupera el ajuste sin eliminar su reserva.",
      );
    if (
      receipt.status === "pending" &&
      matches &&
      lock.operation === "balance-adjustment" &&
      lock.expectedWalletRevision !== receipt.walletRevision - 1
    )
      throw new Error("La revisión del ajuste no corresponde a esta partida.");
    if (receipt.status === "pending") {
      const before =
        party.bag?.walletRevision === receipt.walletRevision - 1 &&
        party.bag?.money === receipt.balanceBefore;
      const alreadyStored =
        party.bag?.walletRevision === receipt.walletRevision &&
        party.bag?.money === receipt.balanceAfter;
      if (
        (!before && !alreadyStored) ||
        wallet.revision !== receipt.walletRevision ||
        wallet.balance !== receipt.balanceAfter ||
        party.bag?.walletUserId !== wallet.userId ||
        SHOP_ITEM_IDS.some(
          (item) =>
            (wallet.items[item] ?? 0) !== (party.bag?.items?.[item] ?? 0),
        )
      )
        throw new Error(
          "El saldo o la Bag no coincide con el ajuste. Recupera la operación original.",
        );
      const next = partyWithWallet(party, wallet);
      return {
        party: {
          ...next,
          pvpRevision: pvpPartyRevision(next) + 1,
          shopLock: {
            requestId: receipt.requestId,
            userId: wallet.userId,
            clientId,
            operation: "balance-adjustment" as const,
            expectedWalletRevision: receipt.walletRevision - 1,
            appliedWalletRevision: receipt.walletRevision,
          },
        },
        value: "pending" as const,
      };
    }
    const terminalBalance =
      receipt.status === "cancelled"
        ? receipt.cancelledBalance!
        : receipt.balanceAfter;
    if (
      wallet.revision === terminalRevision &&
      wallet.balance !== terminalBalance
    )
      throw new Error(
        "El saldo confirmado no coincide con el resultado del ajuste.",
      );
    const next = {
      ...partyWithWallet(party, wallet),
      pvpRevision: pvpPartyRevision(party) + 1,
      balanceAdjustmentRevision: Math.max(
        party.balanceAdjustmentRevision ?? 0,
        terminalRevision,
      ),
      ...(matches ? { shopLock: undefined } : {}),
    };
    return { party: next, value: receipt.status };
  });
}

/** Store consent before a network request. Nothing from the game is deleted yet. */
export function prepareGameReset(
  userId: number,
  clientId: string,
  requestId: string,
  expectedWalletRevision: number,
): Promise<void> {
  return transactPvpParty(userId, async (party) => {
    if (localBattleActive(party))
      throw new Error("Termina la batalla antes de reiniciar la partida.");
    if (
      party.shopLock ||
      party.itemUseLock ||
      party.centerLock ||
      party.captureAttempt
    )
      throw new Error(
        "Recupera la compra pendiente antes de reiniciar la partida.",
      );
    if (
      party.bag?.walletUserId !== userId ||
      party.bag.walletRevision !== expectedWalletRevision
    )
      throw new Error(
        "Actualiza tus Pokedollars antes de reiniciar la partida.",
      );
    if (party.resetLock) {
      if (
        party.resetLock.userId !== userId ||
        party.resetLock.clientId !== clientId ||
        party.resetLock.requestId !== requestId ||
        party.resetLock.expectedWalletRevision !== expectedWalletRevision
      )
        throw new Error(
          "Hay otro reinicio pendiente. Recupéralo desde el navegador original.",
        );
      return { party, value: undefined };
    }
    return {
      party: {
        ...party,
        pvpRevision: pvpPartyRevision(party) + 1,
        resetLock: { userId, clientId, requestId, expectedWalletRevision },
      },
      value: undefined,
    };
  });
}

/** Apply a committed new game once, before ACK. Only terminal server receipts
 * release the intent; absence from any cache or sync never means cancellation.
 */
export function applyGameReset(
  wallet: Wallet,
  receipt: GameReset,
  clientId: string,
): Promise<"pending" | "applied" | "cancelled" | "ignored"> {
  if (
    !validWallet(wallet) ||
    !validGameReset(receipt) ||
    receipt.userId !== wallet.userId
  )
    return Promise.reject(new Error("El reinicio recibido no es válido."));
  return transactPvpParty(wallet.userId, async (party) => {
    const lock = party.resetLock;
    if (
      !lock ||
      receipt.clientId !== clientId ||
      lock.clientId !== clientId ||
      lock.userId !== wallet.userId ||
      lock.requestId !== receipt.requestId
    )
      return { party, value: "ignored" as const };
    if (
      (party.bag?.walletRevision ?? -1) > wallet.revision ||
      receipt.walletRevision > wallet.revision
    )
      return { party, value: "ignored" as const };
    if (receipt.status === "cancelled") {
      if (lock.appliedWalletRevision !== undefined)
        throw new Error(
          "La cancelación no coincide con el reinicio ya guardado.",
        );
      return {
        party: {
          ...party,
          pvpRevision: pvpPartyRevision(party) + 1,
          resetLock: undefined,
        },
        value: "cancelled" as const,
      };
    }
    if (
      party.pvpLock ||
      party.shopLock ||
      party.centerLock ||
      party.captureAttempt
    )
      throw new Error(
        "La partida conserva otra reserva pendiente; no se aplicó el reinicio.",
      );
    if (receipt.walletRevision !== lock.expectedWalletRevision + 1)
      throw new Error(
        "La revisión del reinicio no corresponde a esta partida.",
      );
    let next = party;
    if (lock.appliedWalletRevision === undefined) {
      if (
        wallet.revision !== receipt.walletRevision ||
        wallet.balance !== 500 ||
        Object.values(wallet.items).some((quantity) => quantity !== 0)
      )
        throw new Error(
          "Recupera la cartera correspondiente al reinicio antes de continuar.",
        );
      // The public Redux reset dispatch is guarded; only this checked transaction
      // calls the pure reducer after receiving the server's exact receipt.
      next = partyWithWallet(
        partyReducer({ ...party, resetLock: undefined }, resetGame()),
        wallet,
      );
      next = {
        ...next,
        pvpRevision:
          Math.max(pvpPartyRevision(next), pvpPartyRevision(party)) + 1,
        resetLock: { ...lock, appliedWalletRevision: receipt.walletRevision },
      };
    } else if (lock.appliedWalletRevision !== receipt.walletRevision) {
      throw new Error("El reinicio guardado no coincide con su confirmación.");
    }
    if (receipt.status === "applied")
      next = {
        ...next,
        pvpRevision: pvpPartyRevision(next) + 1,
        resetLock: undefined,
      };
    return { party: next, value: receipt.status };
  });
}
