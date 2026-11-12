import type { PartyState } from "@/slices/partySlice";
import { combatKey } from "@/lib/emerald/types";
import { transactPvpParty } from "@/store/store";
import { pvpPartyRevision } from "@/store/accountStorage";
import { localBattleActive, partyWithWallet, validWallet } from "./wallet";
import type { ItemUse, Wallet } from "./types";

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
    item.itemId === "full-restore" &&
    ["party", "local-battle"].includes(item.context) &&
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
): Promise<void> {
  return transactPvpParty(userId, async (party) => {
    if (
      !id(clientId) ||
      !id(requestId) ||
      !id(captureId) ||
      !revision(expectedWalletRevision)
    )
      throw new Error("La solicitud de Full Restore no es válida.");
    if (party.pvpLock || party.shopLock || party.resetLock || party.itemUseLock)
      throw new Error(
        "Termina la batalla reservada o la operación pendiente antes de usar Full Restore.",
      );
    if (
      party.bag?.walletUserId !== userId ||
      party.bag.walletRevision !== expectedWalletRevision
    )
      throw new Error("Sincroniza tu inventario antes de usar Full Restore.");
    if ((party.bag.items?.["full-restore"] ?? 0) < 1)
      throw new Error("No tienes Full Restore en tu Bag.");
    const context = localBattleActive(party) ? "local-battle" : "party";
    const prepared = clone(await plan(clone(party), captureId));
    if (
      prepared.pvpLock ||
      prepared.shopLock ||
      prepared.resetLock ||
      prepared.itemUseLock
    )
      throw new Error("No se pudo preparar Full Restore para esta partida.");
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
      lock.context !== receipt.context ||
      lock.planHash !== receipt.planHash ||
      lock.expectedWalletRevision !== receipt.expectedWalletRevision
    )
      throw new Error(
        "El recibo no corresponde al Full Restore preparado en este navegador.",
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
        "La partida conserva otra reserva; no se aplicó Full Restore.",
      );
    let next = party;
    if (lock.appliedWalletRevision === undefined) {
      if (
        wallet.revision !== receipt.walletRevision ||
        wallet.balance !== party.bag?.money ||
        (wallet.items["full-restore"] ?? 0) !==
          (party.bag?.items?.["full-restore"] ?? 0) - 1 ||
        (await itemUseHash(combatKey(party))) !== lock.expectedCombatHash ||
        (await itemUseHash(lock.prepared)) !== lock.planHash
      )
        throw new Error(
          "La partida o el inventario no coincide con Full Restore. Recupera la operación original.",
        );
      next = partyWithWallet(clone(lock.prepared), wallet);
      next = {
        ...next,
        pvpRevision:
          Math.max(pvpPartyRevision(next), pvpPartyRevision(party)) + 1,
        itemUseLock: { ...lock, appliedWalletRevision: receipt.walletRevision },
      };
    } else if (lock.appliedWalletRevision !== receipt.walletRevision) {
      throw new Error(
        "El Full Restore guardado no coincide con su confirmación.",
      );
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
