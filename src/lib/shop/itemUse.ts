import type { PartyState } from "@/slices/partySlice";
import { combatKey } from "@/lib/emerald/types";
import { transactPvpParty } from "@/store/store";
import { pvpPartyRevision } from "@/store/accountStorage";
import { localBattleActive, partyWithWallet, validWallet } from "./wallet";
import {
  USABLE_ITEM_IDS,
  SHOP_ITEM_IDS,
  type UsableItemId,
  type ItemUse,
  type Wallet,
} from "./types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const id = (value: unknown) =>
  typeof value === "string" && /^[\w.:-]{1,128}$/.test(value);
const revision = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0;
export function validItemUse(value: unknown): value is ItemUse {
  if (!value || typeof value !== "object") return false;
  const item = value as ItemUse;
  return (
    id(item.requestId) &&
    id(item.clientId) &&
    id(item.captureId) &&
    Number.isSafeInteger(item.userId) &&
    item.userId > 0 &&
    USABLE_ITEM_IDS.includes(item.itemId) &&
    (item.itemId === "max-ether" || item.itemId === "tm"
      ? Number.isSafeInteger(item.moveId) &&
        Number(item.moveId) >= 1 &&
        Number(item.moveId) <= 354
      : item.moveId === undefined) &&
    ["party", "local-battle"].includes(item.context) &&
    (item.itemId !== "tm" || item.context === "party") &&
    typeof item.planHash === "string" &&
    /^[a-f0-9]{64}$/.test(item.planHash) &&
    revision(item.expectedWalletRevision) &&
    revision(item.walletRevision) &&
    ["pending", "applied", "cancelled"].includes(item.status) &&
    (item.status === "cancelled" ||
      item.walletRevision === item.expectedWalletRevision + 1)
  );
}
export async function itemUseHash(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Persist the exact prepared effects before asking the server to consume stock. */
export function prepareItemUse(
  userId: number,
  clientId: string,
  requestId: string,
  captureId: string,
  expectedWalletRevision: number,
  plan: (party: PartyState, captureId: string) => Promise<PartyState>,
  itemId: UsableItemId = "full-restore",
  moveId?: number,
): Promise<void> {
  return transactPvpParty(userId, async (party) => {
    if (
      !id(clientId) ||
      !id(requestId) ||
      !id(captureId) ||
      !revision(expectedWalletRevision) ||
      !USABLE_ITEM_IDS.includes(itemId) ||
      (itemId === "max-ether" || itemId === "tm"
        ? !Number.isSafeInteger(moveId) ||
          Number(moveId) < 1 ||
          Number(moveId) > 354
        : moveId !== undefined)
    )
      throw new Error("La solicitud de uso del objeto no es válida.");
    if (party.pvpLock || party.shopLock || party.resetLock || party.itemUseLock)
      throw new Error(
        "Termina la batalla reservada o la operación pendiente antes de usar un objeto.",
      );
    if (
      party.bag?.walletUserId !== userId ||
      party.bag.walletRevision !== expectedWalletRevision
    )
      throw new Error("Sincroniza tu inventario antes de usar un objeto.");
    if ((party.bag.items?.[itemId] ?? 0) < 1)
      throw new Error("No tienes existencias de este objeto en tu Bag.");
    const context = localBattleActive(party) ? "local-battle" : "party";
    if (itemId === "tm" && context !== "party")
      throw new Error("Las TM sólo pueden usarse fuera de combate.");
    const prepared = clone(await plan(clone(party), captureId));
    if (
      prepared.pvpLock ||
      prepared.shopLock ||
      prepared.resetLock ||
      prepared.itemUseLock
    )
      throw new Error("No se pudo preparar el objeto para esta partida.");
    if (combatKey(prepared) === combatKey(party))
      throw new Error(
        "El objeto no tendría efecto; no se consumió ninguna unidad.",
      );
    const planHash = await itemUseHash(prepared);
    const expectedCombatHash = await itemUseHash(combatKey(party));
    return {
      party: {
        ...party,
        pvpRevision: pvpPartyRevision(party) + 1,
        itemUseLock: {
          userId,
          clientId,
          requestId,
          captureId,
          itemId,
          ...(moveId === undefined ? {} : { moveId }),
          context,
          planHash,
          expectedWalletRevision,
          expectedCombatHash,
          prepared,
        },
      },
      value: undefined,
    };
  });
}

/** The consumption and its exact effects are committed together before ACK. */
export function applyItemUse(
  wallet: Wallet,
  receipt: ItemUse,
  clientId: string,
): Promise<"pending" | "applied" | "cancelled" | "ignored"> {
  if (
    !validWallet(wallet) ||
    !validItemUse(receipt) ||
    receipt.userId !== wallet.userId
  )
    return Promise.reject(new Error("El consumo recibido no es válido."));
  return transactPvpParty(wallet.userId, async (party) => {
    const lock = party.itemUseLock;
    if (
      !lock ||
      lock.userId !== wallet.userId ||
      lock.clientId !== clientId ||
      receipt.clientId !== clientId ||
      lock.requestId !== receipt.requestId
    )
      return { party, value: "ignored" as const };
    if (
      lock.captureId !== receipt.captureId ||
      (lock.itemId ?? "full-restore") !== receipt.itemId ||
      lock.moveId !== receipt.moveId ||
      lock.context !== receipt.context ||
      lock.planHash !== receipt.planHash ||
      lock.expectedWalletRevision !== receipt.expectedWalletRevision
    )
      throw new Error(
        "El recibo no corresponde al objeto preparado en este navegador.",
      );
    if (receipt.status === "cancelled") {
      if (lock.appliedWalletRevision !== undefined)
        throw new Error("El consumo ya guardado no puede cancelarse.");
      return {
        party: {
          ...party,
          pvpRevision: pvpPartyRevision(party) + 1,
          itemUseLock: undefined,
        },
        value: "cancelled" as const,
      };
    }
    if (
      (party.bag?.walletRevision ?? -1) > wallet.revision ||
      receipt.walletRevision > wallet.revision
    )
      return { party, value: "ignored" as const };
    if (party.pvpLock || party.shopLock || party.resetLock)
      throw new Error(
        "La partida conserva otra reserva; no se aplicó el objeto.",
      );
    let next = party;
    if (lock.appliedWalletRevision === undefined) {
      if (
        wallet.revision !== receipt.walletRevision ||
        wallet.balance !== party.bag?.money ||
        (wallet.items[receipt.itemId] ?? 0) !==
          (party.bag?.items?.[receipt.itemId] ?? 0) - 1 ||
        SHOP_ITEM_IDS.some(
          (itemId) =>
            itemId !== receipt.itemId &&
            (wallet.items[itemId] ?? 0) !== (party.bag?.items?.[itemId] ?? 0),
        ) ||
        (await itemUseHash(combatKey(party))) !== lock.expectedCombatHash ||
        (await itemUseHash(lock.prepared)) !== lock.planHash
      )
        throw new Error(
          "La partida o el inventario no coincide con el objeto. Recupera la operación original.",
        );
      next = partyWithWallet(clone(lock.prepared), wallet);
      next = {
        ...next,
        pvpRevision:
          Math.max(pvpPartyRevision(next), pvpPartyRevision(party)) + 1,
        itemUseLock: { ...lock, appliedWalletRevision: receipt.walletRevision },
      };
    } else if (lock.appliedWalletRevision !== receipt.walletRevision) {
      throw new Error("El objeto guardado no coincide con su confirmación.");
    }
    if (receipt.status === "applied")
      next = {
        ...next,
        pvpRevision: pvpPartyRevision(next) + 1,
        itemUseLock: undefined,
      };
    return { party: next, value: receipt.status };
  });
}
