import assert from "node:assert/strict";
import reducer, {
  changeBagMoney,
  resetGame,
  toggleGymBadge,
} from "../src/slices/partySlice";
import {
  accountStorageKey,
  accountStorage,
  encodeAccountParty,
  PVP_PARTY_COMMIT,
  setPvpSyncBlocked,
  setShopSyncBlocked,
  isLocalPartyMutationBlocked,
} from "../src/store/accountStorage";
import {
  applyShopWallet,
  localBattleActive,
  partyWithWallet,
  prepareShopParty,
  validWallet,
} from "../src/lib/shop/wallet";
import type { Wallet } from "../src/lib/shop/types";
declare const testStorage: {
  getItem(key: string): string | null;
  failWritesFor: Set<string>;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const wallet = (
  userId: number,
  revision = 0,
  balance = 500,
  items: Wallet["items"] = {},
): Wallet => ({ userId, revision, balance, items, currencyVersion: 1 });
function saved(userId: number) {
  return JSON.parse(
    JSON.parse(testStorage.getItem(accountStorageKey(userId))!).party,
  );
}

export async function runAccountStorageTests() {
  const { store, persistor, activateAccountStore, clearAccountStore } =
    await import("../src/store/store");
  const passed: string[] = [];
  const id = 601,
    other = 602;
  await activateAccountStore(id);
  setPvpSyncBlocked(false);
  assert.equal(store.getState().party.bag?.money, 500);
  const beforeMutation = JSON.stringify(store.getState().party);
  store.dispatch(changeBagMoney({ amount: 999, direction: "add" }));
  store.dispatch(changeBagMoney({ amount: 100, direction: "subtract" }));
  assert.equal(JSON.stringify(store.getState().party), beforeMutation);
  passed.push(
    "new games start with 500 Pokedollars and legacy money actions cannot add or subtract funds",
  );

  const legacy = clone(store.getState().party);
  legacy.bag = { money: 9123, badges: ["boulder"] };
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: legacy });
  await persistor.flush();
  await applyShopWallet(wallet(id));
  assert.equal(store.getState().party.bag?.money, 500);
  assert.equal(store.getState().party.bag?.walletRevision, 0);
  assert.deepEqual(store.getState().party.bag?.badges, ["boulder"]);
  assert.deepEqual(store.getState().party.bag?.items, {});
  assert.equal(saved(id).bag.money, 500);
  passed.push(
    "the canonical currency version resets an old balance once while preserving party and badges",
  );

  const preflightBefore = clone(store.getState().party);
  const preparationRevision = await prepareShopParty(
    id,
    "client-one",
    "buy-one",
    0,
  );
  assert.equal(preparationRevision, 0);
  assert.equal(saved(id).shopLock.requestId, "buy-one");
  assert.equal(isLocalPartyMutationBlocked(store.getState().party), true);
  await accountStorage.setItem(
    "persist:root",
    encodeAccountParty(preflightBefore),
  );
  assert.equal(
    saved(id).shopLock.requestId,
    "buy-one",
    "an old tab cannot overwrite the persisted preflight reservation",
  );
  const locked = JSON.stringify(store.getState().party);
  store.dispatch(resetGame());
  store.dispatch(toggleGymBadge("cascade"));
  assert.equal(JSON.stringify(store.getState().party), locked);
  await assert.rejects(
    prepareShopParty(id, "client-two", "buy-two", 0),
    /otra compra/,
  );
  passed.push(
    "preflight persists its purchase lock before acknowledgement and blocks all local party mutations",
  );

  const paid = wallet(id, 1, 200, { "great-ball": 1 });
  const oldParty = clone(store.getState().party);
  testStorage.failWritesFor.add(accountStorageKey(id));
  await assert.rejects(applyShopWallet(paid, ["buy-one"]), /guardar/);
  assert.equal(saved(id).bag.money, 500);
  assert.equal(saved(id).shopLock.requestId, "buy-one");
  testStorage.failWritesFor.clear();
  await applyShopWallet(paid, ["buy-one"]);
  assert.equal(saved(id).bag.money, 200);
  assert.equal(saved(id).bag.items["great-ball"], 1);
  assert.equal(saved(id).shopLock.requestId, "buy-one");
  assert.deepEqual(store.getState().party.pokemons, oldParty.pokemons);
  const once = JSON.stringify(store.getState().party);
  await applyShopWallet(paid, ["buy-one"]);
  assert.equal(JSON.stringify(store.getState().party), once);
  passed.push(
    "wallet and item quantities save atomically; storage failures do not acknowledge, and receipt replays never deduct or add twice",
  );

  await applyShopWallet(paid, []);
  assert.equal(
    store.getState().party.shopLock?.requestId,
    "buy-one",
    "a delayed state or ACK without a pending entry cannot unlock preflight",
  );
  await applyShopWallet(wallet(id), [], { abortUnlockRequestId: "buy-one" });
  assert.equal(
    store.getState().party.shopLock?.requestId,
    "buy-one",
    "an older wallet cannot prove a purchase was aborted",
  );
  await applyShopWallet(paid, [], {
    appliedPurchases: [
      {
        purchaseId: "purchase-one",
        requestId: "buy-one",
        adminUserId: 900,
        userId: id,
        clientId: "client-one",
        itemId: "great-ball",
        quantity: 1,
        unitPrice: 300,
        total: 300,
        balanceBefore: 500,
        balanceAfter: 200,
        walletRevision: 1,
        status: "applied",
      },
    ],
  });
  setShopSyncBlocked(false);
  assert.equal(store.getState().party.shopLock, undefined);
  const released = clone(store.getState().party);
  store.dispatch(resetGame());
  assert.equal(store.getState().party.bag?.money, 200);
  assert.equal(store.getState().party.bag?.items?.["great-ball"], 1);
  assert.equal(store.getState().party.bag?.walletRevision, 1);
  assert.equal(partyWithWallet(released, wallet(id)).bag?.money, 200);
  await assert.rejects(applyShopWallet(wallet(id, 1, 500)), /no coincide/);
  passed.push(
    "authoritative completion releases the lock; resets and older snapshots cannot replenish currency or remove purchases",
  );

  await activateAccountStore(other);
  await assert.rejects(applyShopWallet(wallet(id, 2, 50)), /cuenta cambió/);
  await applyShopWallet(wallet(other));
  const current = clone(store.getState().party);
  current.pvpLock = {
    version: 1,
    battleId: "battle",
    userId: other,
    clientId: "client-two",
    phase: "held",
    lockedAt: "test",
  };
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: current });
  await persistor.flush();
  assert.equal(localBattleActive(current), true);
  await assert.rejects(
    prepareShopParty(other, "client-two", "during-battle", 0),
    /batalla/,
  );
  assert.equal(validWallet({ ...wallet(other), balance: -1 }), false);
  assert.equal(validWallet({ ...wallet(other), items: { hacked: 3 } }), false);
  assert.equal(saved(id).bag.money, 200);
  passed.push(
    "wrong accounts, invalid balances and battle reservations cannot prepare purchases or change another save",
  );
  await activateAccountStore(603);
  await applyShopWallet(wallet(603));
  await prepareShopParty(603, "client-three", "aborted", 0);
  await applyShopWallet(wallet(603), []);
  assert.equal(
    store.getState().party.shopLock?.requestId,
    "aborted",
    "old same-revision presence snapshots must retain the lock",
  );
  await applyShopWallet(wallet(603), [], {
    abortUnlockRequestId: "different-request",
  });
  assert.equal(store.getState().party.shopLock?.requestId, "aborted");
  await applyShopWallet(wallet(603), [], { abortUnlockRequestId: "aborted" });
  assert.equal(store.getState().party.shopLock, undefined);
  assert.equal(store.getState().party.bag?.money, 500);
  passed.push(
    "a confirmed aborted preflight clears only its reservation and never charges the player",
  );
  setShopSyncBlocked(false);
  await clearAccountStore();
  persistor.pause();
  await persistor.flush();
  return passed;
}
