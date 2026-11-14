import assert from "node:assert/strict";
import reducer, {
  applyFullRestoreToParty,
  changeBagMoney,
  addPokemon,
  configureGame,
  learnPokemonMoveWithTm,
  resetGame,
  captureWildOpponent,
  toggleGymBadge,
  setBattleOpponent,
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
  isAccountTransactionBlocked,
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
  applyBalanceAdjustment,
  validBalanceAdjustment,
  validShopCatalog,
} from "../src/lib/shop/wallet";
import type {
  BalanceAdjustment,
  GameReset,
  ItemUse,
  Wallet,
} from "../src/lib/shop/types";
import {
  applyItemUse,
  prepareItemUse,
  validItemUse,
} from "../src/lib/shop/itemUse";
import { SHOP_ITEM_IDS } from "../src/lib/shop/types";
import { captureRequirements } from "../src/lib/captureRates";
import {
  prepareBallCaptureParty,
  resolveCaptureAttempt,
} from "../src/lib/shop/ballCapture";
import {
  applyCenterHealing,
  prepareCenterHealing,
  previewCenterParty,
  restoreCenterPokemons,
} from "../src/lib/shop/centerHealing";
import type { CenterHeal } from "../src/lib/shop/types";
import { preparePartyItem, prepareTmParty } from "../src/lib/fullRestorePlan";
import { trainerMoves } from "../src/lib/trainerBattle/catalog";
import {
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { combatKey } from "../src/lib/emerald/types";
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
  const {
    store,
    persistor,
    activateAccountStore,
    clearAccountStore,
    transactPvpParty,
  } = await import("../src/store/store");
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
  await activateAccountStore(606);
  const itemParty = clone(partyBeforeReset);
  itemParty.pvpReceipts = [];
  itemParty.opponent = null;
  itemParty.pvpRevision = 0;
  itemParty.bag = {
    money: 200,
    badges: [],
    items: { "full-restore": 2 },
    currencyVersion: 1,
    walletUserId: 606,
    walletRevision: 0,
  };
  itemParty.pokemons[0].pokemon.stats.find((s) => s.name === "hp")!.value = 1;
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: itemParty });
  await persistor.flush();
  const targetId = itemParty.pokemons[0].captureId;
  const plan = async (party: typeof itemParty, captureId: string) =>
    applyFullRestoreToParty(party, captureId);
  testStorage.failWritesFor.add(accountStorageKey(606));
  await assert.rejects(
    prepareItemUse(606, "item-client", "use-item", targetId, 0, plan),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.equal(saved(606).itemUseLock, undefined);
  await prepareItemUse(606, "item-client", "use-item", targetId, 0, plan);
  assert.equal(getCurrentHp(saved(606).pokemons[0].pokemon), 1);
  assert.equal(saved(606).bag.items["full-restore"], 2);
  const lock = store.getState().party.itemUseLock!;
  const receipt: ItemUse = {
    requestId: lock.requestId,
    userId: 606,
    clientId: lock.clientId,
    itemId: "full-restore",
    captureId: targetId,
    context: "party",
    planHash: lock.planHash,
    expectedWalletRevision: 0,
    walletRevision: 1,
    status: "pending",
  };
  const consumed = wallet(606, 1, 200, { "full-restore": 1 });
  testStorage.failWritesFor.add(accountStorageKey(606));
  await assert.rejects(
    applyItemUse(consumed, receipt, "item-client"),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.equal(saved(606).itemUseLock.appliedWalletRevision, undefined);
  await applyItemUse(consumed, receipt, "item-client");
  assert.equal(
    getCurrentHp(saved(606).pokemons[0].pokemon),
    getMaxHp(itemParty.pokemons[0].pokemon),
  );
  assert.equal(saved(606).bag.items["full-restore"], 1);
  assert.equal(saved(606).bag.money, 200);
  const healed = JSON.stringify(store.getState().party);
  await applyItemUse(consumed, receipt, "item-client");
  assert.equal(JSON.stringify(store.getState().party), healed);
  await clearAccountStore();
  await activateAccountStore(606);
  await applyItemUse(
    consumed,
    { ...receipt, status: "applied" },
    "item-client",
  );
  assert.equal(saved(606).itemUseLock, undefined);
  assert.equal(saved(606).bag.items["full-restore"], 1);
  await applyItemUse(consumed, receipt, "item-client");
  assert.equal(saved(606).itemUseLock, undefined);
  passed.push(
    "Full Restore saves its exact effect before debit, heals and consumes once before ACK, and recovers storage/ACK loss without reusing stock",
  );
  const ppParty = clone(store.getState().party);
  ppParty.bag = {
    ...ppParty.bag!,
    items: { "full-restore": 1, "max-ether": 2, "max-elixir": 1 },
    walletRevision: 1,
  };
  ppParty.pokemons[0].moves = [
    {
      id: 33,
      name: "tackle",
      displayName: "Tackle",
      type: "normal",
      damageClass: "physical",
      power: 35,
      accuracy: 95,
      pp: 35,
      currentPp: 0,
      priority: 0,
      description: "Test",
      source: "starter",
    },
    {
      id: 45,
      name: "growl",
      displayName: "Growl",
      type: "normal",
      damageClass: "status",
      power: null,
      accuracy: 100,
      pp: 40,
      currentPp: 2,
      priority: 0,
      description: "Test",
      source: "starter",
    },
  ];
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: ppParty });
  await persistor.flush();
  await prepareItemUse(
    606,
    "item-client",
    "ether-use",
    targetId,
    1,
    (party, captureId) => preparePartyItem(party, captureId, "max-ether", 33),
    "max-ether",
    33,
  );
  const etherLock = store.getState().party.itemUseLock!;
  assert.equal(saved(606).pokemons[0].moves[0].currentPp, 0);
  const etherReceipt: ItemUse = {
    ...receipt,
    requestId: "ether-use",
    itemId: "max-ether",
    moveId: 33,
    planHash: etherLock.planHash,
    expectedWalletRevision: 1,
    walletRevision: 2,
  };
  const etherWallet = wallet(606, 2, 200, {
    "full-restore": 1,
    "max-ether": 1,
    "max-elixir": 1,
  });
  await assert.rejects(
    applyItemUse(etherWallet, { ...etherReceipt, moveId: 45 }, "item-client"),
    /recibo/,
  );
  await assert.rejects(
    applyItemUse(
      { ...etherWallet, items: { ...etherWallet.items, "max-elixir": 0 } },
      etherReceipt,
      "item-client",
    ),
    /inventario/,
  );
  testStorage.failWritesFor.add(accountStorageKey(606));
  await assert.rejects(
    applyItemUse(etherWallet, etherReceipt, "item-client"),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  await applyItemUse(etherWallet, etherReceipt, "item-client");
  assert.equal(saved(606).pokemons[0].moves[0].currentPp, 35);
  assert.equal(saved(606).pokemons[0].moves[1].currentPp, 2);
  await clearAccountStore();
  await activateAccountStore(606);
  await applyItemUse(
    etherWallet,
    { ...etherReceipt, status: "applied" },
    "item-client",
  );
  assert.equal(saved(606).bag.items["max-ether"], 1);
  await assert.rejects(
    prepareItemUse(
      606,
      "item-client",
      "ether-full",
      targetId,
      2,
      (party, captureId) => preparePartyItem(party, captureId, "max-ether", 33),
      "max-ether",
      33,
    ),
    /efecto/,
  );
  assert.equal(saved(606).itemUseLock, undefined);
  await prepareItemUse(
    606,
    "item-client",
    "elixir-use",
    targetId,
    2,
    (party, captureId) => preparePartyItem(party, captureId, "max-elixir"),
    "max-elixir",
  );
  const elixirReceipt: ItemUse = {
    ...receipt,
    requestId: "elixir-use",
    itemId: "max-elixir",
    planHash: store.getState().party.itemUseLock!.planHash,
    expectedWalletRevision: 2,
    walletRevision: 3,
  };
  const elixirWallet = wallet(606, 3, 200, {
    "full-restore": 1,
    "max-ether": 1,
    "max-elixir": 0,
  });
  await applyItemUse(elixirWallet, elixirReceipt, "item-client");
  assert.deepEqual(
    saved(606).pokemons[0].moves.map(
      (move: { currentPp: number }) => move.currentPp,
    ),
    [35, 40],
  );
  await applyItemUse(
    elixirWallet,
    { ...elixirReceipt, status: "applied" },
    "item-client",
  );
  await applyItemUse(elixirWallet, elixirReceipt, "item-client");
  assert.equal(saved(606).bag.items["max-elixir"], 0);
  assert.equal(saved(606).bag.money, 200);
  passed.push(
    "Max Ether restores only its bound move, Max Elixir restores every move, exact debits survive storage/ACK failure and reload, and a full move costs no object",
  );

  const tmParty = clone(store.getState().party);
  tmParty.opponent = null;
  delete tmParty.emerald;
  tmParty.bag!.items = { ...tmParty.bag!.items, tm: 2 };
  const tmTarget = tmParty.pokemons[0];
  tmTarget.pokemon.learnset = {
    versionGroup: "emerald",
    moves: [33, 45, 52, 55, 150].map((id) => {
      const move = trainerMoves.find((move) => move.id === id)!;
      return { id, name: move.name };
    }),
  };
  tmTarget.origin = "starter";
  tmTarget.initialMovesChosen = 2;
  const tmMove = {
    ...clone(trainerMoves.find((move) => move.id === 150)!),
    currentPp: 0,
  };
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: tmParty });
  await persistor.flush();
  const beforeFreeTm = JSON.stringify(store.getState().party);
  await assert.rejects(
    store.dispatch(
      learnPokemonMoveWithTm({ captureId: targetId, move: tmMove }),
    ),
    /inventario/,
  );
  store.dispatch({
    type: "party/learnPokemonMoveWithTm",
    payload: {
      captureId: targetId,
      move: tmMove,
      expected: combatKey(store.getState().party),
    },
  });
  assert.equal(JSON.stringify(store.getState().party), beforeFreeTm);
  const tmPlan = (party: typeof tmParty, captureId: string) =>
    prepareTmParty(party, captureId, tmMove);
  testStorage.failWritesFor.add(accountStorageKey(606));
  await assert.rejects(
    prepareItemUse(
      606,
      "item-client",
      "tm-use",
      targetId,
      3,
      tmPlan,
      "tm",
      150,
    ),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.equal(saved(606).itemUseLock, undefined);
  await prepareItemUse(
    606,
    "item-client",
    "tm-use",
    targetId,
    3,
    tmPlan,
    "tm",
    150,
  );
  assert.equal(
    saved(606).pokemons[0].moves.some(
      (move: { id: number }) => move.id === 150,
    ),
    false,
  );
  assert.equal(saved(606).bag.items.tm, 2);
  const tmReceipt: ItemUse = {
    ...receipt,
    requestId: "tm-use",
    itemId: "tm",
    moveId: 150,
    planHash: store.getState().party.itemUseLock!.planHash,
    expectedWalletRevision: 3,
    walletRevision: 4,
  };
  const tmWallet = wallet(606, 4, 200, { ...elixirWallet.items, tm: 1 });
  await assert.rejects(
    applyItemUse(tmWallet, { ...tmReceipt, moveId: 52 }, "item-client"),
    /recibo/,
  );
  testStorage.failWritesFor.add(accountStorageKey(606));
  await assert.rejects(
    applyItemUse(tmWallet, tmReceipt, "item-client"),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.equal(saved(606).itemUseLock.appliedWalletRevision, undefined);
  await clearAccountStore();
  await activateAccountStore(606);
  await applyItemUse(tmWallet, tmReceipt, "item-client");
  assert.equal(
    saved(606).pokemons[0].moves.find((move: { id: number }) => move.id === 150)
      .currentPp,
    40,
  );
  assert.equal(saved(606).bag.items.tm, 1);
  const tmApplied = JSON.stringify(store.getState().party);
  await applyItemUse(tmWallet, tmReceipt, "item-client");
  assert.equal(JSON.stringify(store.getState().party), tmApplied);
  await applyItemUse(
    tmWallet,
    { ...tmReceipt, status: "applied" },
    "item-client",
  );
  assert.equal(saved(606).itemUseLock, undefined);
  assert.equal(saved(606).activityHistory[0].kind, "tm");
  const tmHistoryLength = saved(606).activityHistory.length;
  await assert.rejects(
    prepareItemUse(
      606,
      "item-client",
      "tm-known",
      targetId,
      4,
      tmPlan,
      "tm",
      150,
    ),
    /compatibilidad/,
  );
  assert.equal(saved(606).itemUseLock, undefined);
  assert.equal(saved(606).activityHistory.length, tmHistoryLength);
  passed.push(
    "TM stock is required for learning, paid moves start with full PP, legacy dispatch cannot learn for free, and checked-save failure/reload/replayed ACK preserve one effect and debit",
  );

  const replacement = clone(store.getState().party);
  replacement.pokemons[0].moves!.push({
    ...clone(trainerMoves.find((move) => move.id === 52)!),
    currentPp: 0,
  });
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: replacement });
  await persistor.flush();
  const waterGun = clone(trainerMoves.find((move) => move.id === 55)!);
  const replacePlan = (party: typeof tmParty, captureId: string) =>
    prepareTmParty(party, captureId, waterGun, 33);
  await prepareItemUse(
    606,
    "item-client",
    "tm-cancel",
    targetId,
    4,
    replacePlan,
    "tm",
    55,
  );
  const cancelledTm: ItemUse = {
    ...tmReceipt,
    requestId: "tm-cancel",
    moveId: 55,
    planHash: store.getState().party.itemUseLock!.planHash,
    expectedWalletRevision: 4,
    walletRevision: 4,
    status: "cancelled",
  };
  await applyItemUse(tmWallet, cancelledTm, "item-client");
  assert.equal(saved(606).itemUseLock, undefined);
  assert.equal(
    saved(606).pokemons[0].moves.some((move: { id: number }) => move.id === 55),
    false,
  );
  assert.equal(saved(606).bag.items.tm, 1);
  const battling = clone(store.getState().party);
  battling.opponent = {
    kind: "wild",
    pokemon: clone(battling.pokemons[0].pokemon),
    statuses: [],
    stages: neutralBattleStages(),
  };
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: battling });
  await persistor.flush();
  await assert.rejects(
    prepareItemUse(
      606,
      "item-client",
      "tm-battle",
      targetId,
      4,
      replacePlan,
      "tm",
      55,
    ),
    /fuera de combate/,
  );
  assert.equal(saved(606).itemUseLock, undefined);
  await transactPvpParty(606, async () => ({
    party: clone(replacement),
    value: undefined,
  }));
  await prepareItemUse(
    606,
    "item-client",
    "tm-replace",
    targetId,
    4,
    replacePlan,
    "tm",
    55,
  );
  const replacementReceipt: ItemUse = {
    ...tmReceipt,
    requestId: "tm-replace",
    moveId: 55,
    planHash: store.getState().party.itemUseLock!.planHash,
    expectedWalletRevision: 4,
    walletRevision: 5,
  };
  const spentTm = wallet(606, 5, 200, { ...tmWallet.items, tm: 0 });
  await applyItemUse(spentTm, replacementReceipt, "item-client");
  await applyItemUse(
    spentTm,
    { ...replacementReceipt, status: "applied" },
    "item-client",
  );
  const afterReplace = saved(606);
  assert.equal(afterReplace.pokemons[0].moves.length, 4);
  assert.deepEqual(
    afterReplace.pokemons[0].moves.map((move: { id: number }) => move.id),
    [55, 45, 150, 52],
  );
  assert.equal(afterReplace.pokemons[0].initialMovesChosen, 2);
  assert.equal(afterReplace.bag.items.tm, 0);
  assert.equal(afterReplace.bag.money, 200);
  await assert.rejects(
    prepareItemUse(
      606,
      "item-client",
      "tm-empty",
      targetId,
      5,
      tmPlan,
      "tm",
      150,
    ),
    /existencias/,
  );
  await clearAccountStore();
  await activateAccountStore(606);
  await applyItemUse(spentTm, replacementReceipt, "item-client");
  assert.deepEqual(
    saved(606).pokemons[0].moves,
    afterReplace.pokemons[0].moves,
  );
  assert.equal(saved(606).bag.items.tm, 0);
  passed.push(
    "TM replacement spends one unit at four moves without restoring starter choices; cancellation keeps stock, battle/empty-stock guards preserve the Party and results survive reload",
  );
  await transactPvpParty(606, async (party) => {
    const before = JSON.stringify(store.getState().party);
    assert.equal(isAccountTransactionBlocked(), true);
    store.dispatch(toggleGymBadge("cascade"));
    assert.equal(JSON.stringify(store.getState().party), before);
    return { party, value: undefined };
  });
  assert.equal(isAccountTransactionBlocked(), false);
  passed.push(
    "checked inventory writes fence concurrent normal actions until persistence resumes; no late wallet reconciliation overwrites a local turn",
  );
  const priorBalance = saved(606);
  const balanceRevision = priorBalance.bag.walletRevision;
  await prepareShopParty(
    606,
    "balance-client",
    "balance-request",
    balanceRevision,
    "balance-adjustment",
  );
  const adjustedWallet = wallet(
    606,
    balanceRevision + 1,
    priorBalance.bag.money + 150,
    priorBalance.bag.items,
  );
  const adjustment = {
    adjustmentId: "balance-id",
    requestId: "balance-request",
    adminUserId: 1,
    userId: 606,
    clientId: "balance-client",
    delta: 150,
    balanceBefore: priorBalance.bag.money,
    balanceAfter: adjustedWallet.balance,
    walletRevision: adjustedWallet.revision,
    status: "pending" as const,
  };
  assert.equal(validBalanceAdjustment(adjustment), true);
  assert.equal(
    validBalanceAdjustment({ ...adjustment, balanceAfter: -1 }),
    false,
  );
  await applyShopWallet(adjustedWallet);
  assert.equal(
    saved(606).bag.money,
    priorBalance.bag.money,
    "wallet alone cannot skip its adjustment receipt",
  );
  testStorage.failWritesFor.add(accountStorageKey(606));
  await assert.rejects(
    applyBalanceAdjustment(adjustedWallet, adjustment, "balance-client"),
  );
  testStorage.failWritesFor.delete(accountStorageKey(606));
  await applyBalanceAdjustment(adjustedWallet, adjustment, "balance-client");
  assert.deepEqual(saved(606).pokemons, priorBalance.pokemons);
  assert.deepEqual(saved(606).bag.items, priorBalance.bag.items);
  assert.equal(saved(606).bag.money, adjustedWallet.balance);
  await applyShopWallet(adjustedWallet, [], {
    abortUnlockRequestId: "balance-request",
  });
  assert.ok(
    saved(606).shopLock,
    "an abort proof cannot release an already applied balance effect",
  );
  await applyBalanceAdjustment(
    adjustedWallet,
    { ...adjustment, status: "applied" },
    "balance-client",
  );
  assert.equal(saved(606).shopLock, undefined);
  await clearAccountStore();
  await activateAccountStore(606);
  assert.equal(
    await applyBalanceAdjustment(adjustedWallet, adjustment, "balance-client"),
    "ignored",
  );
  assert.equal(saved(606).bag.money, adjustedWallet.balance);
  passed.push(
    "admin balance adjustments preserve Party/items/PP, reject wallet-only application, survive checked-save failure/reload and never repeat or release an applied marker by an abort proof",
  );

  // A pre-2.6 client stored PREPARE as a purchase lock, adopted the authoritative
  // wallet, and released that lock without ever sending balance-applied. These
  // fixtures represent its actual durable state, not a newly prepared operation.
  const legacyTeam = clone(store.getState().party.pokemons);
  const legacySettings = clone(store.getState().party.gameSettings);
  async function legacyBalanceFixture(
    userId: number,
    state: "before" | "after" | "legacy-lock" = "after",
  ) {
    await clearAccountStore();
    await activateAccountStore(userId);
    setPvpSyncBlocked(false);
    setShopSyncBlocked(false);
    const beforeWallet = wallet(userId, 0, 500, { tm: 2, "full-restore": 1 });
    await transactPvpParty(userId, async (current) => ({
      party: partyWithWallet(
        {
          ...current,
          pokemons: clone(legacyTeam),
          gameSettings: clone(legacySettings),
          opponent: null,
        },
        beforeWallet,
      ),
      value: undefined,
    }));
    const receipt: BalanceAdjustment = {
      adjustmentId: `legacy-adjustment-${userId}`,
      requestId: `legacy-request-${userId}`,
      adminUserId: 1,
      userId,
      clientId: "original-legacy-client",
      delta: 10000,
      balanceBefore: 500,
      balanceAfter: 10500,
      walletRevision: 1,
      status: "pending",
    };
    const afterWallet = wallet(userId, 1, 10500, beforeWallet.items);
    if (state !== "before") {
      // No operation discriminator: this is the format older frontends wrote.
      await prepareShopParty(userId, receipt.clientId, receipt.requestId, 0);
      await applyShopWallet(
        afterWallet,
        state === "legacy-lock" ? [receipt.requestId] : [],
        {
          abortUnlockRequestId: receipt.requestId,
        },
      );
      assert.equal(saved(userId).bag.money, 10500);
      assert.equal(Boolean(saved(userId).shopLock), state === "legacy-lock");
    }
    return { receipt, beforeWallet, afterWallet };
  }

  for (const [userId, mode] of [
    [607, "before"],
    [608, "after"],
    [609, "legacy-lock"],
  ] as const) {
    const { receipt, afterWallet } = await legacyBalanceFixture(userId, mode);
    const original = saved(userId);
    if (mode === "after") {
      testStorage.failWritesFor.add(accountStorageKey(userId));
      await assert.rejects(
        applyBalanceAdjustment(afterWallet, receipt, receipt.clientId),
      );
      testStorage.failWritesFor.delete(accountStorageKey(userId));
      assert.deepEqual(
        saved(userId),
        original,
        "failed adoption cannot pretend it persisted a recovery lock or marker",
      );
    }
    assert.equal(
      await applyBalanceAdjustment(afterWallet, receipt, receipt.clientId),
      "pending",
    );
    const recovered = saved(userId);
    assert.equal(
      recovered.bag.money,
      10500,
      `legacy ${mode} replaces canonical cash; it does not add 10000 again`,
    );
    assert.equal(recovered.bag.walletRevision, 1);
    assert.equal(recovered.shopLock.operation, "balance-adjustment");
    assert.equal(recovered.shopLock.appliedWalletRevision, 1);
    assert.deepEqual(recovered.pokemons, original.pokemons);
    assert.deepEqual(recovered.bag.items, original.bag.items);
    await clearAccountStore();
    await activateAccountStore(userId);
    assert.equal(
      await applyBalanceAdjustment(afterWallet, receipt, receipt.clientId),
      "pending",
    );
    assert.deepEqual(saved(userId).pokemons, recovered.pokemons);
    assert.equal(saved(userId).bag.money, 10500);
    await applyBalanceAdjustment(
      afterWallet,
      { ...receipt, status: "applied" },
      receipt.clientId,
    );
    assert.equal(saved(userId).shopLock, undefined);
    await clearAccountStore();
    await activateAccountStore(userId);
    assert.equal(
      await applyBalanceAdjustment(afterWallet, receipt, receipt.clientId),
      "ignored",
      "a stale pending receipt cannot reopen a terminally acknowledged adjustment after reload",
    );
    assert.equal(saved(userId).shopLock, undefined);
    assert.equal(saved(userId).bag.money, 10500);
  }
  passed.push(
    "legacy balance recovery adopts missing or purchase-format locks with before/already-credited wallets, persists one canonical 10000 grant and never reopens an acknowledged receipt after reload",
  );

  const blockedLegacy = await legacyBalanceFixture(610, "after");
  const foreignClientBefore = saved(610);
  assert.equal(
    await applyBalanceAdjustment(
      blockedLegacy.afterWallet,
      blockedLegacy.receipt,
      "different-browser",
    ),
    "ignored",
  );
  assert.deepEqual(
    saved(610),
    foreignClientBefore,
    "another browser cannot adopt or release the original receipt",
  );
  await prepareShopParty(
    610,
    blockedLegacy.receipt.clientId,
    "unrelated-purchase",
    1,
  );
  const foreignLockBefore = saved(610);
  try {
    assert.equal(
      await applyBalanceAdjustment(
        blockedLegacy.afterWallet,
        blockedLegacy.receipt,
        blockedLegacy.receipt.clientId,
      ),
      "ignored",
    );
  } catch (error) {
    assert.match(
      (error as Error).message,
      /operaci|reserva|compra|bloque|pendiente/i,
    );
  }
  assert.deepEqual(
    saved(610),
    foreignLockBefore,
    "legacy recovery cannot replace or release a different operation's lock",
  );
  passed.push(
    "legacy recovery refuses a different client and never clears an unrelated local operation",
  );

  const cancelledLegacy = await legacyBalanceFixture(611, "after");
  await transactPvpParty(611, async (current) => {
    const opponentPokemon = clone(current.pokemons[0].pokemon);
    opponentPokemon.stats.find((stat) => stat.name === "hp")!.value = 1;
    return {
      party: {
        ...current,
        opponent: {
          kind: "trainer" as const,
          encounterId: "legacy-continued-battle",
          pokemon: opponentPokemon,
          moves: clone(current.pokemons[0].moves),
          statuses: [],
          stages: neutralBattleStages(),
        },
      },
      value: undefined,
    };
  });
  const continued = saved(611);
  assert.equal(localBattleActive(store.getState().party), true);
  assert.equal(
    await applyBalanceAdjustment(
      cancelledLegacy.afterWallet,
      cancelledLegacy.receipt,
      cancelledLegacy.receipt.clientId,
    ),
    "pending",
    "currency recovery preserves a local encounter the older frontend started during the gap",
  );
  assert.deepEqual(saved(611).opponent, continued.opponent);
  const cancellation: BalanceAdjustment = {
    ...cancelledLegacy.receipt,
    status: "cancelled",
    cancelledWalletRevision: 2,
    cancelledBalance: 500,
  };
  const cancelledWallet = wallet(
    611,
    2,
    500,
    cancelledLegacy.beforeWallet.items,
  );
  assert.equal(validBalanceAdjustment(cancellation), true);
  assert.equal(
    await applyBalanceAdjustment(
      cancelledWallet,
      cancellation,
      cancellation.clientId,
    ),
    "cancelled",
  );
  const cancelledSave = saved(611);
  assert.equal(cancelledSave.bag.money, 500);
  assert.equal(cancelledSave.bag.walletRevision, 2);
  assert.equal(cancelledSave.shopLock, undefined);
  assert.deepEqual(cancelledSave.pokemons, continued.pokemons);
  assert.deepEqual(cancelledSave.opponent, continued.opponent);
  assert.deepEqual(cancelledSave.bag.items, continued.bag.items);
  await clearAccountStore();
  await activateAccountStore(611);
  await applyBalanceAdjustment(
    cancelledWallet,
    cancellation,
    cancellation.clientId,
  );
  assert.equal(
    await applyBalanceAdjustment(
      cancelledLegacy.afterWallet,
      cancelledLegacy.receipt,
      cancellation.clientId,
    ),
    "ignored",
  );
  assert.equal(saved(611).shopLock, undefined);
  assert.equal(
    saved(611).bag.money,
    500,
    "duplicate cancellation and late pending packets never apply a second compensation or restore the grant",
  );
  assert.deepEqual(saved(611).opponent, continued.opponent);
  passed.push(
    "cancelled legacy adjustments restore the canonical wallet once without deleting the Party or a resumed local encounter, and remain terminal across reload and late packets",
  );
  await clearAccountStore();
  const centerUser = 612;
  await activateAccountStore(centerUser);
  await applyShopWallet(
    wallet(centerUser, 3, 1600, { "full-restore": 2, tm: 1 }),
  );
  await transactPvpParty(centerUser, async (current) => {
    const template = clone(legacyTeam[0]);
    const captures = Array.from({ length: 3 }, (_, index) => {
      const capture = clone(template);
      capture.captureId = `center-pokemon-${index}`;
      capture.pokemon.stats.find((stat) => stat.name === "hp")!.value =
        index === 0 ? 0 : 1;
      capture.statuses = ["poisoned"];
      capture.statusTurns = {};
      capture.pokemon.battleStages = {
        ...neutralBattleStages(),
        attack: -3,
        defense: 2,
      };
      capture.moves = trainerMoves
        .filter((move) => [33, 45].includes(move.id))
        .map((move) => ({
          ...move,
          source: "starter" as const,
          currentPp: 0,
        }));
      return capture;
    });
    return {
      party: { ...current, pokemons: captures, opponent: null },
      value: undefined,
    };
  });
  const centerBefore = clone(store.getState().party);
  const preview = await previewCenterParty(centerUser, "center-client");
  assert.equal(preview.pokemons[0].currentHp, 0);
  assert.equal(
    preview.pokemons.every((capture) => capture.needsHealing),
    true,
  );
  assert.throws(
    () =>
      restoreCenterPokemons(
        centerBefore,
        preview.pokemons.map((capture) => capture.captureId),
      ),
    /uno o dos/,
  );
  assert.throws(
    () =>
      restoreCenterPokemons(centerBefore, [
        preview.pokemons[0].captureId,
        preview.pokemons[0].captureId,
      ]),
    /distintos/,
  );
  assert.throws(
    () => restoreCenterPokemons(centerBefore, ["missing"]),
    /ya no pertenece/,
  );
  const centerRequest = {
    requestId: "center-first",
    adminUserId: 900,
    playerUserId: centerUser,
    clientId: "center-client",
    captureIds: preview.pokemons
      .slice(0, 2)
      .map((capture) => capture.captureId),
    partyHash: preview.partyHash,
    partyRevision: preview.partyRevision,
    centerRevision: 1,
  };
  await assert.rejects(
    prepareCenterHealing(
      { ...centerRequest, partyHash: "0".repeat(64) },
      "center-client",
    ),
    /equipo cambió/,
  );
  const centerLock = await prepareCenterHealing(centerRequest, "center-client");
  assert.equal(saved(centerUser).centerLock.requestId, centerRequest.requestId);
  assert.equal(isLocalPartyMutationBlocked(store.getState().party), true);
  const centerLocked = JSON.stringify(store.getState().party);
  store.dispatch(toggleGymBadge("cascade"));
  assert.equal(JSON.stringify(store.getState().party), centerLocked);
  await assert.rejects(
    prepareShopParty(centerUser, "center-client", "center-racing-buy", 3),
    /pendiente/,
  );
  await assert.rejects(
    prepareGameReset(centerUser, "center-client", "center-racing-reset", 3),
    /pendiente/,
  );
  await assert.rejects(
    prepareItemUse(
      centerUser,
      "center-client",
      "center-racing-item",
      centerRequest.captureIds[0],
      3,
      (party, captureId) => preparePartyItem(party, captureId, "full-restore"),
    ),
    /operación pendiente/,
  );
  passed.push(
    "Poké Center accepts fainted teams, limits selection to 1–2 unique existing captures, binds the current preview and reserves against edits, purchases, items and resets",
  );
  const centerReceipt: CenterHeal = {
    requestId: centerLock.requestId,
    adminUserId: centerLock.adminUserId,
    userId: centerLock.userId,
    clientId: centerLock.clientId,
    captureIds: centerLock.captureIds,
    partyHash: centerLock.partyHash,
    partyRevision: centerLock.partyRevision,
    planHash: centerLock.planHash,
    centerRevision: centerLock.centerRevision,
    status: "pending",
  };
  assert.equal(
    await applyCenterHealing(centerReceipt, "wrong-client"),
    "ignored",
  );
  testStorage.failWritesFor.add(accountStorageKey(centerUser));
  await assert.rejects(
    applyCenterHealing(centerReceipt, "center-client"),
    /guardar/,
  );
  assert.equal(
    saved(centerUser).pokemons[0].pokemon.stats.find(
      (stat: { name: string }) => stat.name === "hp",
    ).value,
    0,
  );
  assert.equal(saved(centerUser).centerLock.applied, undefined);
  testStorage.failWritesFor.clear();
  await applyCenterHealing(centerReceipt, "center-client");
  const centerHealed = clone(store.getState().party);
  for (let index = 0; index < 2; index++) {
    const capture = centerHealed.pokemons[index];
    assert.equal(getCurrentHp(capture.pokemon), getMaxHp(capture.pokemon));
    assert.deepEqual(capture.statuses, []);
    assert.deepEqual(capture.statusTurns, {});
    assert.deepEqual(capture.pokemon.battleStages, neutralBattleStages());
    assert.equal(
      capture.moves!.every((move) => move.currentPp === move.pp),
      true,
    );
    assert.equal(
      capture.pokemon.level,
      centerBefore.pokemons[index].pokemon.level,
    );
    assert.deepEqual(
      capture.pokemon.baseStats,
      centerBefore.pokemons[index].pokemon.baseStats,
    );
    assert.deepEqual(
      capture.pokemon.stats.filter((stat) => stat.name !== "hp"),
      centerBefore.pokemons[index].pokemon.stats.filter(
        (stat) => stat.name !== "hp",
      ),
    );
  }
  assert.deepEqual(centerHealed.pokemons[2], centerBefore.pokemons[2]);
  assert.deepEqual(centerHealed.bag, centerBefore.bag);
  assert.equal(centerHealed.centerLock?.applied, true);
  await applyCenterHealing(centerReceipt, "center-client");
  assert.deepEqual(store.getState().party, centerHealed);
  passed.push(
    "Center healing saves HP, revival, all PP, statuses and temporary stages atomically before ACK while preserving permanent stats, untouched captures and every Bag value; failed writes and replays cannot apply twice",
  );
  await applyCenterHealing(
    { ...centerReceipt, status: "applied" },
    "center-client",
  );
  assert.equal(saved(centerUser).centerLock, undefined);
  assert.equal(saved(centerUser).centerHealingRevision, 1);
  await clearAccountStore();
  await activateAccountStore(centerUser);
  assert.equal(
    await applyCenterHealing(centerReceipt, "center-client"),
    "ignored",
  );
  assert.equal(saved(centerUser).centerLock, undefined);
  const centerSecondPreview = await previewCenterParty(
    centerUser,
    "center-client",
  );
  const secondRequest = {
    ...centerRequest,
    requestId: "center-second",
    captureIds: [centerSecondPreview.pokemons[2].captureId],
    partyHash: centerSecondPreview.partyHash,
    partyRevision: centerSecondPreview.partyRevision,
    centerRevision: 2,
  };
  const secondLock = await prepareCenterHealing(secondRequest, "center-client");
  const secondReceipt: CenterHeal = {
    ...centerReceipt,
    ...secondLock,
    status: "cancelled",
  };
  await applyCenterHealing(secondReceipt, "center-client");
  assert.equal(saved(centerUser).centerHealingRevision, 2);
  assert.equal(
    saved(centerUser).pokemons[2].pokemon.stats.find(
      (stat: { name: string }) => stat.name === "hp",
    ).value,
    1,
  );
  assert.equal(
    await applyCenterHealing(
      { ...secondReceipt, status: "pending" },
      "center-client",
    ),
    "ignored",
  );
  passed.push(
    "Terminal Center receipts survive reload, fence late PENDING and release only their own reservation; cancellation preserves unhealed Pokémon instead of reconstructing or replaying effects",
  );
  const ballUser = 613;
  await activateAccountStore(ballUser);
  await applyShopWallet(
    wallet(ballUser, 0, 777, { "poke-ball": 2, "great-ball": 1 }),
  );
  await transactPvpParty(ballUser, async (current) => {
    const actor = clone(legacyTeam[0]);
    actor.captureId = "ball-actor";
    actor.pokemon.stats.find((stat) => stat.name === "hp")!.value = getMaxHp(
      actor.pokemon,
    )!;
    actor.statuses = [];
    actor.statusTurns = {};
    actor.pokemon.battleStages = neutralBattleStages();
    const wildPokemon = clone(actor.pokemon);
    wildPokemon.id = 19;
    wildPokemon.name = "rattata";
    wildPokemon.learnset = {
      versionGroup: "emerald",
      moves: [{ id: 150, name: "splash" }],
    };
    return {
      party: {
        ...current,
        gameSettings: clone(legacySettings),
        starterClaimed: true,
        pokemons: [actor],
        opponent: {
          kind: "wild",
          encounterId: "ball-wild-1",
          pokemon: wildPokemon,
          moves: [
            {
              ...clone(trainerMoves.find((move) => move.id === 150)!),
              currentPp: 40,
              source: "wild",
            },
          ],
          statuses: ["poisoned"],
          statusTurns: {},
          stages: neutralBattleStages(),
        },
        emerald: undefined,
        battleField: {
          version: 1,
          turn: 1,
          activeCaptureId: actor.captureId,
          weather: null,
          waterSport: null,
          mudSport: null,
        },
      },
      value: undefined,
    };
  });
  const ballBefore = clone(store.getState().party);
  store.dispatch(captureWildOpponent("ball-wild-1"));
  assert.deepEqual(
    clone(store.getState().party),
    ballBefore,
    "legacy raw capture dispatch cannot bypass spending",
  );
  const ballSeed: [number, number, number, number] = [3, 7, 11, 17];
  const ballPlan = (party: typeof ballBefore, captureId: string) =>
    prepareBallCaptureParty(
      party,
      captureId,
      "poke-ball",
      { userId: ballUser, clientId: "ball-client", requestId: "ball-use-1" },
      ballSeed,
      "ball-caught-1",
    );
  testStorage.failWritesFor.add(accountStorageKey(ballUser));
  await assert.rejects(
    prepareItemUse(
      ballUser,
      "ball-client",
      "ball-use-1",
      "ball-actor",
      0,
      ballPlan,
      "poke-ball",
    ),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.equal(saved(ballUser).bag.items["poke-ball"], 2);
  assert.equal(saved(ballUser).captureAttempt, undefined);
  await assert.rejects(
    prepareBallCaptureParty(
      ballBefore,
      "ball-actor",
      "ultra-ball",
      { userId: ballUser, clientId: "ball-client", requestId: "no-stock" },
      ballSeed,
      "no-stock-capture",
    ),
    /existencias/,
  );
  await assert.rejects(
    prepareBallCaptureParty(
      ballBefore,
      "ball-actor",
      "poke-ball",
      { userId: ballUser, clientId: "ball-client", requestId: "stale-quote" },
      ballSeed,
      "stale-capture",
      { minimum: 20, encounterId: "ball-wild-1" },
    ),
    /mínimo cambió/,
  );
  await prepareItemUse(
    ballUser,
    "ball-client",
    "ball-use-1",
    "ball-actor",
    0,
    ballPlan,
    "poke-ball",
  );
  const ballLock = store.getState().party.itemUseLock!;
  const ballReceipt: ItemUse = {
    requestId: ballLock.requestId,
    userId: ballUser,
    clientId: "ball-client",
    itemId: "poke-ball",
    captureId: "ball-actor",
    context: "local-battle",
    planHash: ballLock.planHash,
    expectedWalletRevision: 0,
    walletRevision: 1,
    status: "pending",
  };
  const ballWallet = wallet(ballUser, 1, 777, {
    "poke-ball": 1,
    "great-ball": 1,
  });
  testStorage.failWritesFor.add(accountStorageKey(ballUser));
  await assert.rejects(
    applyItemUse(ballWallet, ballReceipt, "ball-client"),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.equal(saved(ballUser).captureAttempt, undefined);
  await applyItemUse(ballWallet, ballReceipt, "ball-client");
  assert.equal(saved(ballUser).captureAttempt.attemptId, "ball-use-1");
  assert.equal(saved(ballUser).bag.items["poke-ball"], 1);
  await assert.rejects(
    resolveCaptureAttempt(ballUser, "ball-use-1", "caught"),
    /Confirma el consumo/,
  );
  await applyItemUse(
    ballWallet,
    { ...ballReceipt, status: "applied" },
    "ball-client",
  );
  const paidAttempt = saved(ballUser).captureAttempt;
  assert.equal(isLocalPartyMutationBlocked(store.getState().party), true);
  await assert.rejects(
    prepareGameReset(ballUser, "ball-client", "ball-racing-reset", 1),
    /batalla|pendiente/,
  );
  await assert.rejects(
    prepareShopParty(ballUser, "ball-client", "ball-racing-buy", 1),
    /batalla|pendiente/,
  );
  await clearAccountStore();
  await activateAccountStore(ballUser);
  assert.deepEqual(
    saved(ballUser).captureAttempt,
    paidAttempt,
    "paid die prompt survives reload",
  );
  const actorPp = clone(store.getState().party.pokemons[0].moves);
  testStorage.failWritesFor.add(accountStorageKey(ballUser));
  await assert.rejects(
    resolveCaptureAttempt(ballUser, "ball-use-1", "escaped"),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.deepEqual(
    saved(ballUser).captureAttempt,
    paidAttempt,
    "failed outcome save retains exact seed and target",
  );
  const missed = await resolveCaptureAttempt(ballUser, "ball-use-1", "escaped");
  assert.equal(missed.outcome, "escaped");
  const missedParty = saved(ballUser);
  assert.equal(missedParty.captureAttempt, undefined);
  assert.equal(missedParty.bag.items["poke-ball"], 1);
  assert.deepEqual(
    missedParty.pokemons[0].moves,
    actorPp,
    "throw uses no player PP",
  );
  assert.equal(
    missedParty.opponent.moves[0].currentPp,
    39,
    "wild response spends one PP",
  );
  assert.ok(missedParty.battleField.turn >= 2);
  await resolveCaptureAttempt(ballUser, "ball-use-1", "escaped");
  assert.deepEqual(
    saved(ballUser),
    missedParty,
    "repeat miss cannot run the enemy twice",
  );
  await assert.rejects(
    resolveCaptureAttempt(ballUser, "ball-use-1", "caught"),
    /otro resultado/,
  );
  passed.push(
    "Pokeballs are paid before the external die; zero stock/stale quotes and legacy raw capture are rejected, reload preserves the attempt, and a failed saved outcome runs exactly one deterministic enemy turn without player PP",
  );
  const successPlan = (party: typeof ballBefore, captureId: string) =>
    prepareBallCaptureParty(
      party,
      captureId,
      "great-ball",
      { userId: ballUser, clientId: "ball-client", requestId: "ball-use-2" },
      [19, 23, 29, 31],
      "ball-caught-2",
    );
  await prepareItemUse(
    ballUser,
    "ball-client",
    "ball-use-2",
    "ball-actor",
    1,
    successPlan,
    "great-ball",
  );
  const successLock = store.getState().party.itemUseLock!;
  const successReceipt: ItemUse = {
    ...ballReceipt,
    requestId: "ball-use-2",
    itemId: "great-ball",
    planHash: successLock.planHash,
    expectedWalletRevision: 1,
    walletRevision: 2,
    status: "applied",
  };
  const successWallet = wallet(ballUser, 2, 777, {
    "poke-ball": 1,
    "great-ball": 0,
  });
  await applyItemUse(successWallet, successReceipt, "ball-client");
  const beforeCatch = saved(ballUser);
  testStorage.failWritesFor.add(accountStorageKey(ballUser));
  await assert.rejects(
    resolveCaptureAttempt(ballUser, "ball-use-2", "caught"),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.equal(saved(ballUser).captureAttempt.attemptId, "ball-use-2");
  await resolveCaptureAttempt(ballUser, "ball-use-2", "caught");
  const caughtParty = saved(ballUser);
  assert.equal(caughtParty.opponent, null);
  assert.equal(caughtParty.pokemons.length, 2);
  assert.equal(caughtParty.pokemons[1].captureId, "ball-caught-2");
  assert.equal(
    getCurrentHp(caughtParty.pokemons[1].pokemon),
    getCurrentHp(beforeCatch.opponent.pokemon),
  );
  assert.equal(caughtParty.bag.items["great-ball"], 0);
  assert.equal(caughtParty.bag.money, 777);
  await clearAccountStore();
  await activateAccountStore(ballUser);
  await resolveCaptureAttempt(ballUser, "ball-use-2", "caught");
  assert.deepEqual(
    saved(ballUser),
    caughtParty,
    "success replay cannot add or pay twice",
  );
  passed.push(
    "A favorable paid physical throw captures once with current HP, statuses and moves, consumes exactly its chosen ball, retains money, and survives outcome-storage failure plus reload/replay",
  );
  const difficultyUser = 614;
  await activateAccountStore(difficultyUser);
  await applyShopWallet(wallet(difficultyUser, 0, 888, { "poke-ball": 1 }));
  await transactPvpParty(difficultyUser, async (current) => ({
    party: {
      ...clone(ballBefore),
      bag: current.bag,
      pvpRevision: (current.pvpRevision ?? 0) + 1,
      itemUseLock: undefined,
      captureAttempt: undefined,
      lastCaptureResult: undefined,
    },
    value: undefined,
  }));
  const difficultyBefore = clone(store.getState().party);
  const baseMinimum = captureRequirements(
    difficultyBefore.opponent!.pokemon,
    difficultyBefore.opponent!.statuses,
  )!.balls[0].minimum!;
  const difficultySettings = { captureDifficulty: 2, captureRevision: 6 };
  const difficultyIdentity = {
    userId: difficultyUser,
    clientId: "difficulty-client",
    requestId: "difficulty-use",
  };
  const difficultyQuote = {
    minimum: baseMinimum + 2,
    encounterId: "ball-wild-1",
    ...difficultySettings,
  };
  for (const quote of [
    { ...difficultyQuote, captureDifficulty: 1 },
    { ...difficultyQuote, captureRevision: 5 },
    { ...difficultyQuote, minimum: baseMinimum },
  ])
    await assert.rejects(
      prepareBallCaptureParty(
        difficultyBefore,
        "ball-actor",
        "poke-ball",
        difficultyIdentity,
        ballSeed,
        "difficulty-caught",
        quote,
        difficultySettings,
      ),
      /mínimo cambió/,
    );
  await assert.rejects(
    prepareBallCaptureParty(
      difficultyBefore,
      "ball-actor",
      "poke-ball",
      difficultyIdentity,
      ballSeed,
      "difficulty-caught",
      undefined,
      { captureDifficulty: 20, captureRevision: 6 },
    ),
    /imposible/,
  );
  await assert.rejects(
    prepareBallCaptureParty(
      difficultyBefore,
      "ball-actor",
      "poke-ball",
      difficultyIdentity,
      ballSeed,
      "difficulty-caught",
      undefined,
      { captureDifficulty: -1, captureRevision: 6 },
    ),
    /entero entre 0 y 20/,
  );
  assert.deepEqual(
    saved(difficultyUser),
    difficultyBefore,
    "stale or impossible quotes spend nothing and create no lock",
  );
  const prices = Object.fromEntries(SHOP_ITEM_IDS.map((item) => [item, 100]));
  assert(validShopCatalog({ revision: 0, prices }));
  assert(validShopCatalog({ revision: 1, prices, captureDifficulty: 20 }));
  for (const modifier of [-1, 0.5, 21, null])
    assert(
      !validShopCatalog({ revision: 1, prices, captureDifficulty: modifier }),
    );
  passed.push(
    "Global difficulty adds to the confirmed minimum, validates legacy/default catalogs and rejects stale revisions or impossible D20 captures without touching inventory or Party",
  );
  await prepareItemUse(
    difficultyUser,
    "difficulty-client",
    "difficulty-use",
    "ball-actor",
    0,
    (party, actor) =>
      prepareBallCaptureParty(
        party,
        actor,
        "poke-ball",
        difficultyIdentity,
        ballSeed,
        "difficulty-caught",
        difficultyQuote,
        difficultySettings,
      ),
    "poke-ball",
    undefined,
    6,
  );
  const difficultyLock = store.getState().party.itemUseLock!;
  assert.equal(difficultyLock.captureRevision, 6);
  const difficultyReceipt: ItemUse = {
    ...ballReceipt,
    requestId: "difficulty-use",
    userId: difficultyUser,
    clientId: "difficulty-client",
    planHash: difficultyLock.planHash,
    captureRevision: 6,
    status: "pending",
  };
  const difficultyWallet = wallet(difficultyUser, 1, 888, { "poke-ball": 0 });
  assert(validItemUse(difficultyReceipt));
  assert(!validItemUse({ ...difficultyReceipt, itemId: "full-restore" }));
  assert(!validItemUse({ ...difficultyReceipt, captureRevision: -1 }));
  await assert.rejects(
    applyItemUse(
      difficultyWallet,
      { ...difficultyReceipt, captureRevision: 5 },
      "difficulty-client",
    ),
    /no corresponde/,
  );
  await applyItemUse(difficultyWallet, difficultyReceipt, "difficulty-client");
  await applyItemUse(
    difficultyWallet,
    { ...difficultyReceipt, status: "applied" },
    "difficulty-client",
  );
  const frozenDifficultyAttempt = clone(saved(difficultyUser).captureAttempt);
  assert.equal(frozenDifficultyAttempt.minimum, baseMinimum + 2);
  assert.equal(frozenDifficultyAttempt.captureRevision, 6);
  assert.equal(frozenDifficultyAttempt.captureDifficulty, 2);
  assert.notEqual(
    captureRequirements(
      difficultyBefore.opponent!.pokemon,
      difficultyBefore.opponent!.statuses,
      10,
    )!.balls[0].minimum,
    frozenDifficultyAttempt.minimum,
  );
  await clearAccountStore();
  await activateAccountStore(difficultyUser);
  assert.deepEqual(
    saved(difficultyUser).captureAttempt,
    frozenDifficultyAttempt,
    "new global settings never rewrite an already paid attempt across reload",
  );
  await resolveCaptureAttempt(difficultyUser, "difficulty-use", "caught");
  await resolveCaptureAttempt(difficultyUser, "difficulty-use", "caught");
  assert.equal(saved(difficultyUser).pokemons.length, 2);
  assert.equal(saved(difficultyUser).bag.items["poke-ball"], 0);
  assert.equal(saved(difficultyUser).bag.money, 888);
  assert.equal(
    paidAttempt.captureRevision,
    undefined,
    "2.8 attempts retain their original shape",
  );
  assert.equal(paidAttempt.captureDifficulty, undefined);
  passed.push(
    "New throws bind catalog revision in their durable lock and receipt; paid difficulty/minimum survive rule changes and reload, while legacy attempts and one-shot consumption remain intact",
  );
  const automaticUser = 615;
  await activateAccountStore(automaticUser);
  await applyShopWallet(wallet(automaticUser, 0, 500, { "full-restore": 1 }));
  await transactPvpParty(automaticUser, async (current) => {
    const actor = clone(ballBefore.pokemons[0]);
    actor.moves = [
      { ...clone(trainerMoves.find((move) => move.id === 33)!), currentPp: 5 },
    ];
    actor.pokemon.stats.find((stat) => stat.name === "hp")!.value -= 20;
    return {
      party: {
        ...current,
        pokemons: [actor],
        opponent: {
          ...clone(ballBefore.opponent!),
          kind: "trainer",
          statuses: [],
          automation: { enabled: true, catalogRevision: 10 },
        },
        battleField: clone(ballBefore.battleField),
        emerald: undefined,
      },
      value: undefined,
    };
  });
  const automaticBefore = clone(store.getState().party);
  await prepareItemUse(
    automaticUser,
    "automatic-client",
    "automatic-item",
    "ball-actor",
    0,
    (party, captureId) => preparePartyItem(party, captureId, "full-restore"),
  );
  const automaticLock = clone(store.getState().party.itemUseLock!);
  const automaticPlanKey = combatKey(automaticLock.prepared);
  assert.equal(saved(automaticUser).battleField.turn, 1);
  assert.equal(saved(automaticUser).opponent.moves[0].currentPp, 40);
  assert.equal(automaticLock.prepared.battleField!.turn, 2);
  assert.equal(automaticLock.prepared.opponent!.moves![0].currentPp, 39);
  assert.deepEqual(automaticLock.prepared.opponent!.automation, {
    enabled: true,
    catalogRevision: 10,
  });
  const automaticReceipt: ItemUse = {
    requestId: "automatic-item",
    userId: automaticUser,
    clientId: "automatic-client",
    itemId: "full-restore",
    captureId: "ball-actor",
    context: "local-battle",
    planHash: automaticLock.planHash,
    expectedWalletRevision: 0,
    walletRevision: 1,
    status: "pending",
  };
  const automaticWallet = wallet(automaticUser, 1, 500, { "full-restore": 0 });
  await clearAccountStore();
  await activateAccountStore(automaticUser);
  assert.equal(
    combatKey(store.getState().party.itemUseLock!.prepared),
    automaticPlanKey,
  );
  testStorage.failWritesFor.add(accountStorageKey(automaticUser));
  await assert.rejects(
    applyItemUse(automaticWallet, automaticReceipt, "automatic-client"),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  await applyItemUse(automaticWallet, automaticReceipt, "automatic-client");
  assert.equal(combatKey(store.getState().party), automaticPlanKey);
  assert.equal(saved(automaticUser).bag.items["full-restore"], 0);
  const automaticAppliedKey = combatKey(store.getState().party);
  await applyItemUse(automaticWallet, automaticReceipt, "automatic-client");
  await clearAccountStore();
  await activateAccountStore(automaticUser);
  await applyItemUse(
    automaticWallet,
    { ...automaticReceipt, status: "applied" },
    "automatic-client",
  );
  await applyItemUse(automaticWallet, automaticReceipt, "automatic-client");
  assert.equal(combatKey(store.getState().party), automaticAppliedKey);
  assert.equal(saved(automaticUser).itemUseLock, undefined);
  assert.equal(
    getCurrentHp(saved(automaticUser).pokemons[0].pokemon),
    getMaxHp(automaticBefore.pokemons[0].pokemon),
  );
  const { submitEmeraldAction } = await import("../src/lib/emerald/commands");
  await store.dispatch(
    submitEmeraldAction("ball-actor", "player", { kind: "move", moveId: 33 }),
  );
  assert.equal(saved(automaticUser).battleField.turn, 3);
  assert.equal(saved(automaticUser).opponent.moves[0].currentPp, 38);
  assert.equal(saved(automaticUser).pokemons[0].moves[0].currentPp, 4);
  passed.push(
    "Automatic trainer item plans freeze both sides before debit, recover storage/ACK loss and reload without replay, then the next checked player command resolves one opponent action",
  );
  const { prepareLocalEncounter } = await import("../src/lib/localEncounter");
  const nextEncounter = {
    ...clone(store.getState().party.opponent!),
    encounterId: "checked-ui-encounter",
    automation: { enabled: false, catalogRevision: 11 },
  };
  let releaseReconciliation!: () => void;
  let reconciliationEntered!: () => void;
  const reconciling = new Promise<void>((resolve) => {
    reconciliationEntered = resolve;
  });
  const reconciliationWait = new Promise<void>((resolve) => {
    releaseReconciliation = resolve;
  });
  const reconciliation = transactPvpParty(automaticUser, async (latest) => {
    reconciliationEntered();
    await reconciliationWait;
    return { party: latest, value: undefined };
  });
  await reconciling;
  assert.equal(isAccountTransactionBlocked(), true);
  store.dispatch(setBattleOpponent(nextEncounter));
  assert.notEqual(
    store.getState().party.opponent!.encounterId,
    nextEncounter.encounterId,
    "the temporary transaction guard must still reject unsafe raw UI dispatches",
  );
  const preparingEncounter = store.dispatch(
    prepareLocalEncounter(nextEncounter),
  );
  releaseReconciliation();
  await reconciliation;
  await preparingEncounter;
  assert.equal(
    saved(automaticUser).opponent.encounterId,
    nextEncounter.encounterId,
  );
  assert.deepEqual(
    saved(automaticUser).opponent.automation,
    nextEncounter.automation,
  );
  assert.equal(saved(automaticUser).emerald, undefined);
  const savedEncounter = clone(saved(automaticUser));
  testStorage.failWritesFor.add(accountStorageKey(automaticUser));
  await assert.rejects(
    store.dispatch(
      prepareLocalEncounter({
        ...nextEncounter,
        encounterId: "failed-ui-encounter",
      }),
    ),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(automaticUser), savedEncounter);
  assert.equal(
    store.getState().party.opponent!.encounterId,
    nextEncounter.encounterId,
  );
  passed.push(
    "Checked encounter creation waits behind wallet reconciliation without weakening its guard, persists the frozen mode before success and preserves the previous encounter on write failure",
  );
  await clearAccountStore();
  persistor.pause();
  await persistor.flush();
  return passed;
}
