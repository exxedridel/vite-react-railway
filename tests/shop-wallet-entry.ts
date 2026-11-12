import assert from "node:assert/strict";
import reducer, {
  changeBagMoney,
  addPokemon,
  configureGame,
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
  setResetSyncBlocked,
  isLocalPartyMutationBlocked,
} from "../src/store/accountStorage";
import {
  applyShopWallet,
  applyGameReset,
  localBattleActive,
  partyWithWallet,
  prepareShopParty,
  prepareGameReset,
  validGameReset,
  validWallet,
} from "../src/lib/shop/wallet";
import type { GameReset, Wallet } from "../src/lib/shop/types";
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

  const resetUser = 604;
  await activateAccountStore(resetUser);
  await applyShopWallet(wallet(resetUser, 2, 200, { "great-ball": 1 }));
  store.dispatch(
    configureGame({ regions: ["kanto"], startingLevel: 5, hpMultiplier: 1.3 }),
  );
  store.dispatch(
    addPokemon({
      id: 1,
      name: "bulbasaur",
      image: null,
      types: ["grass", "poison"],
      stats: [
        "hp",
        "attack",
        "defense",
        "special-attack",
        "special-defense",
        "speed",
      ].map((name) => ({ name, value: 50 })),
      learnset: {
        versionGroup: "emerald",
        moves: [{ id: 33, name: "tackle" }],
      },
    }),
  );
  store.dispatch(toggleGymBadge("boulder"));
  const partyBeforeReset = clone(store.getState().party);
  partyBeforeReset.pvpReceipts = [
    {
      battleId: "past-battle",
      resultId: "past-result",
      userId: resetUser,
      snapshotId: "past-snapshot",
      baseHash: "past-hash",
      resultDigest: "past-digest",
      savedAt: "past",
    },
  ];
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: partyBeforeReset });
  await persistor.flush();
  store.dispatch(resetGame());
  assert.deepEqual(
    store.getState().party,
    partyBeforeReset,
    "a legacy reset dispatch cannot delete a game without server confirmation",
  );
  testStorage.failWritesFor.add(accountStorageKey(resetUser));
  await assert.rejects(
    prepareGameReset(resetUser, "reset-client", "reset-intent", 2),
    /guardar/,
  );
  assert.equal(saved(resetUser).resetLock, undefined);
  assert.equal(saved(resetUser).pokemons.length, 1);
  testStorage.failWritesFor.clear();
  await prepareGameReset(resetUser, "reset-client", "reset-intent", 2);
  const intended = clone(store.getState().party);
  assert.equal(saved(resetUser).resetLock.requestId, "reset-intent");
  assert.equal(saved(resetUser).pokemons.length, 1);
  assert.equal(saved(resetUser).bag.money, 200);
  store.dispatch(toggleGymBadge("cascade"));
  store.dispatch(addPokemon(partyBeforeReset.pokemons[0].pokemon));
  assert.deepEqual(store.getState().party, intended);
  await accountStorage.setItem(
    "persist:root",
    encodeAccountParty(partyBeforeReset),
  );
  assert.equal(
    saved(resetUser).resetLock.requestId,
    "reset-intent",
    "a stale tab cannot erase consent from disk",
  );
  await assert.rejects(
    prepareShopParty(resetUser, "reset-client", "buy-during-reset", 2),
    /reinicio/,
  );
  await assert.rejects(
    prepareGameReset(resetUser, "other-client", "other-reset", 2),
    /otro reinicio/,
  );
  passed.push(
    "reset consent is saved before deletion; storage failure, stale tabs, legacy dispatches and concurrent purchases cannot bypass it",
  );

  const resetWallet = wallet(resetUser, 3);
  const resetReceipt: GameReset = {
    requestId: "reset-intent",
    userId: resetUser,
    clientId: "reset-client",
    walletRevision: 3,
    status: "pending",
  };
  await applyShopWallet(resetWallet);
  assert.equal(
    saved(resetUser).bag.money,
    200,
    "a wallet cache alone cannot apply a pending game reset",
  );
  assert.equal(
    await applyGameReset(
      resetWallet,
      { ...resetReceipt, clientId: "other-client" },
      "reset-client",
    ),
    "ignored",
  );
  assert.equal(
    await applyGameReset(
      resetWallet,
      { ...resetReceipt, requestId: "older-request" },
      "reset-client",
    ),
    "ignored",
  );
  assert.equal(saved(resetUser).pokemons.length, 1);
  testStorage.failWritesFor.add(accountStorageKey(resetUser));
  await assert.rejects(
    applyGameReset(resetWallet, resetReceipt, "reset-client"),
    /guardar/,
  );
  assert.equal(saved(resetUser).pokemons.length, 1);
  assert.equal(saved(resetUser).bag.money, 200);
  assert.equal(saved(resetUser).resetLock.appliedWalletRevision, undefined);
  testStorage.failWritesFor.clear();
  assert.equal(
    await applyGameReset(resetWallet, resetReceipt, "reset-client"),
    "pending",
  );
  const resetAppliedLocally = clone(store.getState().party);
  assert.equal(resetAppliedLocally.pokemons.length, 0);
  assert.equal(resetAppliedLocally.gameSettings, null);
  assert.equal(resetAppliedLocally.starterClaimed, false);
  assert.equal(resetAppliedLocally.bag?.money, 500);
  assert.deepEqual(resetAppliedLocally.bag?.items, {});
  assert.deepEqual(resetAppliedLocally.bag?.badges, []);
  assert.deepEqual(
    resetAppliedLocally.pvpReceipts,
    partyBeforeReset.pvpReceipts,
  );
  assert.equal(resetAppliedLocally.resetLock?.appliedWalletRevision, 3);
  assert.equal(resetAppliedLocally.activityHistory?.[0].kind, "reset");
  assert.equal(
    resetAppliedLocally.activityHistory?.length,
    (partyBeforeReset.activityHistory?.length ?? 0) + 1,
  );
  passed.push(
    "a matching committed reset atomically clears team, progress and purchased items, restores 500 and preserves battle receipts/history before ACK",
  );

  await clearAccountStore();
  await activateAccountStore(resetUser);
  assert.equal(store.getState().party.resetLock?.appliedWalletRevision, 3);
  await applyGameReset(resetWallet, resetReceipt, "reset-client");
  assert.deepEqual(
    store.getState().party,
    resetAppliedLocally,
    "an ACK lost across logout/reload cannot repeat the reset or history entry",
  );
  await applyShopWallet(wallet(resetUser, 2, 200, { "great-ball": 1 }));
  assert.equal(saved(resetUser).bag.money, 500);
  await applyGameReset(
    resetWallet,
    { ...resetReceipt, status: "applied" },
    "reset-client",
  );
  setResetSyncBlocked(false);
  assert.equal(saved(resetUser).resetLock, undefined);
  store.dispatch(
    configureGame({ regions: ["kanto"], startingLevel: 5, hpMultiplier: 1.3 }),
  );
  store.dispatch(addPokemon(partyBeforeReset.pokemons[0].pokemon));
  await persistor.flush();
  const afterNewStarter = clone(store.getState().party);
  await applyGameReset(resetWallet, resetReceipt, "reset-client");
  assert.deepEqual(
    store.getState().party,
    afterNewStarter,
    "old pending reset events cannot delete a new starter",
  );
  await applyShopWallet(wallet(resetUser, 4, 50, { "ultra-ball": 1 }));
  await applyGameReset(
    resetWallet,
    { ...resetReceipt, status: "applied" },
    "reset-client",
  );
  assert.equal(saved(resetUser).bag.money, 50);
  assert.equal(saved(resetUser).bag.items["ultra-ball"], 1);
  passed.push(
    "reset replay after reload, ACK loss, a new starter or a later purchase never deletes progress or replenishes funds again",
  );

  const beforeCancellation = clone(store.getState().party);
  await prepareGameReset(resetUser, "reset-client", "cancel-intent", 4);
  const cancelled: GameReset = {
    requestId: "cancel-intent",
    userId: resetUser,
    clientId: "reset-client",
    walletRevision: 4,
    status: "cancelled",
  };
  await applyShopWallet(wallet(resetUser, 4, 50, { "ultra-ball": 1 }));
  assert.equal(
    saved(resetUser).resetLock.requestId,
    "cancel-intent",
    "an absent receipt never releases an uncommitted request",
  );
  await applyGameReset(
    wallet(resetUser, 4, 50, { "ultra-ball": 1 }),
    { ...cancelled, requestId: "wrong-id" },
    "reset-client",
  );
  assert.equal(saved(resetUser).resetLock.requestId, "cancel-intent");
  assert.equal(
    await applyGameReset(
      wallet(resetUser, 4, 50, { "ultra-ball": 1 }),
      cancelled,
      "reset-client",
    ),
    "cancelled",
  );
  assert.equal(saved(resetUser).resetLock, undefined);
  assert.deepEqual(saved(resetUser).pokemons, beforeCancellation.pokemons);
  assert.deepEqual(saved(resetUser).bag, beforeCancellation.bag);
  assert.equal(
    saved(resetUser).activityHistory.length,
    beforeCancellation.activityHistory?.length,
  );
  assert.equal(validGameReset({ ...cancelled, walletRevision: -1 }), false);
  assert.equal(validGameReset({ ...resetReceipt, status: "unknown" }), false);
  passed.push(
    "only a matching durable cancellation releases an uncommitted reset, preserving its team, items, balance and history",
  );

  const battleParty = clone(store.getState().party);
  battleParty.pvpLock = {
    version: 1,
    battleId: "reset-blocked-battle",
    userId: resetUser,
    clientId: "reset-client",
    phase: "held",
    lockedAt: "test",
  };
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: battleParty });
  await persistor.flush();
  await assert.rejects(
    prepareGameReset(resetUser, "reset-client", "during-reserved-battle", 4),
    /batalla/,
  );
  assert.equal(saved(resetUser).resetLock, undefined);
  await activateAccountStore(other);
  await assert.rejects(
    prepareGameReset(resetUser, "reset-client", "wrong-account-reset", 4),
    /cuenta cambió/,
  );
  passed.push(
    "a reserved battle or another signed-in owner cannot initialize a game reset",
  );
  setShopSyncBlocked(false);
  setResetSyncBlocked(false);
  await clearAccountStore();
  persistor.pause();
  await persistor.flush();
  return passed;
}
