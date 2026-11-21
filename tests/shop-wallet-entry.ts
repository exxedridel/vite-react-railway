import assert from "node:assert/strict";
import reducer, {
  applyFullRestoreToParty,
  changeBagMoney,
  changePokemonHp,
  changeOpponentHp,
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
  validPurchase,
  applyGiftPurchase,
  mergeShopPurchases,
} from "../src/lib/shop/wallet";
import type {
  BalanceAdjustment,
  GameReset,
  ItemUse,
  Wallet,
  ShopPurchase,
} from "../src/lib/shop/types";
import {
  applyItemUse,
  prepareItemUse,
  validItemUse,
  itemUseHash,
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
  changeLevel,
  isLeveled,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { combatKey } from "../src/lib/emerald/types";
import {
  matchingLocalReward,
  queueLocalTrainerReward,
  type CombatReward,
} from "../src/lib/shop/combatRewards";
import { submitLegacyBattleAction } from "../src/lib/legacyBattleAction";
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
  const giftUser = 616;
  await activateAccountStore(giftUser);
  await applyShopWallet(wallet(giftUser, 0, 500, { "poke-ball": 2, tm: 1 }));
  await transactPvpParty(giftUser, async (current) => ({
    party: {
      ...current,
      pokemons: clone(legacyTeam),
      gameSettings: clone(legacySettings),
    },
    value: undefined,
  }));
  const giftBefore = clone(saved(giftUser));
  const giftMetadata = {
    adminUserId: 1,
    itemId: "max-elixir" as const,
    quantity: 3,
  };
  const giftReceipt: ShopPurchase = {
    kind: "gift",
    purchaseId: "gift-purchase",
    requestId: "gift-one",
    clientId: "gift-client",
    adminUserId: 1,
    userId: giftUser,
    itemId: "max-elixir",
    quantity: 3,
    unitPrice: 0,
    total: 0,
    balanceBefore: 500,
    balanceAfter: 500,
    walletRevision: 1,
    status: "pending",
  };
  assert(validPurchase(giftReceipt));
  const legacyFree: ShopPurchase = { ...giftReceipt };
  delete legacyFree.kind;
  const legacyFreeBytes = JSON.stringify(legacyFree);
  assert(validPurchase(legacyFree));
  assert.equal(JSON.stringify(legacyFree), legacyFreeBytes);
  assert(
    validPurchase({ ...giftReceipt, walletRevision: 0, status: "cancelled" }),
  );
  for (const invalid of [
    { ...giftReceipt, kind: "purchase" },
    { ...giftReceipt, quantity: 100 },
    { ...giftReceipt, unitPrice: 2, total: 6, balanceAfter: 494 },
    { ...legacyFree, status: "cancelled" },
    { ...giftReceipt, walletRevision: 0 },
  ])
    assert.equal(validPurchase(invalid), false);
  await assert.rejects(
    prepareShopParty(giftUser, "gift-client", "gift-one", 0, "gift"),
    /preparación/,
  );
  testStorage.failWritesFor.add(accountStorageKey(giftUser));
  await assert.rejects(
    prepareShopParty(
      giftUser,
      "gift-client",
      "gift-one",
      0,
      "gift",
      giftMetadata,
    ),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(giftUser), giftBefore);
  await prepareShopParty(
    giftUser,
    "gift-client",
    "gift-one",
    0,
    "gift",
    giftMetadata,
  );
  assert.deepEqual(saved(giftUser).shopLock, {
    requestId: "gift-one",
    clientId: "gift-client",
    userId: giftUser,
    operation: "gift",
    expectedWalletRevision: 0,
    ...giftMetadata,
  });
  await assert.rejects(
    prepareShopParty(giftUser, "gift-client", "gift-one", 0),
    /otra compra/,
  );
  const giftLocked = clone(saved(giftUser));
  store.dispatch(toggleGymBadge("cascade"));
  assert.deepEqual(saved(giftUser), giftLocked);
  passed.push(
    "Gift validation preserves legacy free purchase bytes, requires a typed admin/item/quantity PREPARE and saves the exact lock before ACK; failed writes or another operation cannot reserve it",
  );
  const giftedWallet = wallet(giftUser, 1, 500, {
    "poke-ball": 2,
    tm: 1,
    "max-elixir": 3,
  });
  await applyShopWallet(giftedWallet, [], {
    abortUnlockRequestId: "gift-one",
    appliedPurchases: [{ ...legacyFree, status: "applied" }],
  });
  assert.deepEqual(
    saved(giftUser),
    giftLocked,
    "wallet-only, free-purchase proof and absence cannot deliver or release a gift",
  );
  await assert.rejects(
    applyGiftPurchase(giftedWallet, legacyFree, "gift-client"),
    /no es válido/,
  );
  for (const mismatch of [
    { ...giftReceipt, requestId: "other-gift" },
    { ...giftReceipt, itemId: "tm" as const },
    { ...giftReceipt, quantity: 2 },
    { ...giftReceipt, adminUserId: 2 },
  ])
    await assert.rejects(
      applyGiftPurchase(giftedWallet, mismatch, "gift-client"),
      /no corresponde/,
    );
  assert.equal(
    await applyGiftPurchase(giftedWallet, giftReceipt, "different-client"),
    "ignored",
  );
  testStorage.failWritesFor.add(accountStorageKey(giftUser));
  await assert.rejects(
    applyGiftPurchase(giftedWallet, giftReceipt, "gift-client"),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(giftUser), giftLocked);
  await applyGiftPurchase(giftedWallet, giftReceipt, "gift-client");
  assert.equal(saved(giftUser).shopLock.appliedWalletRevision, 1);
  assert.equal(saved(giftUser).bag.money, 500);
  assert.deepEqual(saved(giftUser).bag.items, giftedWallet.items);
  assert.deepEqual(saved(giftUser).pokemons, giftBefore.pokemons);
  const giftSaved = clone(saved(giftUser));
  await applyGiftPurchase(giftedWallet, giftReceipt, "gift-client");
  await applyShopWallet(giftedWallet, [], { abortUnlockRequestId: "gift-one" });
  await assert.rejects(
    applyGiftPurchase(
      giftedWallet,
      { ...giftReceipt, status: "cancelled", walletRevision: 0 },
      "gift-client",
    ),
    /ya se guardó/,
  );
  assert.deepEqual(saved(giftUser), giftSaved);
  await clearAccountStore();
  await activateAccountStore(giftUser);
  await applyGiftPurchase(
    giftedWallet,
    { ...giftReceipt, status: "applied" },
    "gift-client",
  );
  assert.equal(saved(giftUser).shopLock, undefined);
  const giftReleased = clone(saved(giftUser));
  await applyGiftPurchase(giftedWallet, giftReceipt, "gift-client");
  await applyGiftPurchase(
    giftedWallet,
    { ...giftReceipt, status: "applied" },
    "gift-client",
  );
  assert.deepEqual(saved(giftUser), giftReleased);
  passed.push(
    "Gift delivery saves canonical Bag and an applied marker together, keeps Pokedollars/Party/PP, rejects wrong identity and recovers write failure/reload/late ACK without granting twice or clearing on absence",
  );
  await prepareShopParty(giftUser, "gift-client", "free-after-gift", 1);
  assert.deepEqual(saved(giftUser).shopLock, {
    requestId: "free-after-gift",
    clientId: "gift-client",
    userId: giftUser,
  });
  const freeReceipt: ShopPurchase = {
    ...legacyFree,
    requestId: "free-after-gift",
    itemId: "tm",
    quantity: 1,
    walletRevision: 2,
    status: "applied",
  };
  const freeWallet = wallet(giftUser, 2, 500, { ...giftedWallet.items, tm: 2 });
  await applyShopWallet(freeWallet, [], {
    appliedPurchases: [{ ...freeReceipt, kind: "gift" }],
  });
  assert(
    saved(giftUser).shopLock,
    "a gift receipt cannot release a real free purchase",
  );
  await applyShopWallet(freeWallet, [], { appliedPurchases: [freeReceipt] });
  assert.equal(saved(giftUser).shopLock, undefined);
  assert.equal(saved(giftUser).bag.items.tm, 2);
  assert.equal(saved(giftUser).bag.items["max-elixir"], 3);
  assert.equal(saved(giftUser).bag.money, 500);
  passed.push(
    "Real zero-price store purchases retain their original lock and receipt shape and remain separate from gifts while canonical quantities accumulate without affecting cash",
  );
  const orphanMetadata = {
    adminUserId: 1,
    itemId: "poke-ball" as const,
    quantity: 2,
  };
  await prepareShopParty(
    giftUser,
    "gift-client",
    "gift-orphan",
    2,
    "gift",
    orphanMetadata,
  );
  const orphanBefore = clone(saved(giftUser));
  await applyShopWallet(freeWallet, [], {
    abortUnlockRequestId: "gift-orphan",
  });
  assert.deepEqual(saved(giftUser), orphanBefore);
  await clearAccountStore();
  await activateAccountStore(giftUser);
  const cancelledGift: ShopPurchase = {
    ...giftReceipt,
    ...orphanMetadata,
    requestId: "gift-orphan",
    status: "cancelled",
    walletRevision: 2,
  };
  await applyGiftPurchase(freeWallet, cancelledGift, "gift-client");
  assert.equal(saved(giftUser).shopLock, undefined);
  const cancelledGiftParty = clone(saved(giftUser));
  assert.deepEqual(cancelledGiftParty.bag, {
    ...giftReleased.bag,
    walletRevision: 2,
    items: freeWallet.items,
  });
  await applyGiftPurchase(freeWallet, cancelledGift, "gift-client");
  await assert.rejects(
    applyGiftPurchase(
      wallet(giftUser, 3, 500, { ...freeWallet.items, "poke-ball": 4 }),
      { ...cancelledGift, status: "pending", walletRevision: 3 },
      "gift-client",
    ),
    /reserva/,
  );
  assert.deepEqual(saved(giftUser), cancelledGiftParty);
  await transactPvpParty(giftUser, async (current) => ({
    party: { ...current, opponent: clone(ballBefore.opponent!) },
    value: undefined,
  }));
  await assert.rejects(
    prepareShopParty(
      giftUser,
      "gift-client",
      "gift-during-battle",
      2,
      "gift",
      orphanMetadata,
    ),
    /batalla/,
  );
  assert.equal(saved(giftUser).shopLock, undefined);
  passed.push(
    "An orphan gift stays locked through absence and reload until its matching durable cancelled receipt; cancellation preserves inventory, fences late delivery and new gifts refuse an ongoing battle",
  );
  const alternateBrowserBefore = clone(store.getState().party);
  const alternateBrowserCombat = combatKey(alternateBrowserBefore);
  const originalBrowserGift: ShopPurchase = {
    ...giftReceipt,
    clientId: "original-gift-browser",
    requestId: "gift-other-browser",
    itemId: "poke-ball",
    quantity: 2,
    walletRevision: 3,
  };
  const alternateBrowserWallet = wallet(giftUser, 3, 500, {
    ...freeWallet.items,
    "poke-ball": 4,
  });
  assert.equal(
    await applyGiftPurchase(
      alternateBrowserWallet,
      originalBrowserGift,
      "alternate-browser",
    ),
    "ignored",
  );
  assert.deepEqual(store.getState().party, alternateBrowserBefore);
  await applyShopWallet(alternateBrowserWallet, [
    originalBrowserGift.requestId,
  ]);
  assert.equal(combatKey(store.getState().party), alternateBrowserCombat);
  assert.equal(saved(giftUser).shopLock, undefined);
  assert.deepEqual(saved(giftUser).bag.items, alternateBrowserWallet.items);
  assert.equal(saved(giftUser).bag.money, 500);
  setShopSyncBlocked(true);
  const alternateBrowserBlocked = clone(store.getState().party);
  store.dispatch(toggleGymBadge("cascade"));
  assert.deepEqual(store.getState().party, alternateBrowserBlocked);
  setShopSyncBlocked(false);
  passed.push(
    "Another browser of the same account observes canonical gifted inventory without applying or acknowledging the original browser's receipt, changing its Party/combat or bypassing the pending-operation guard",
  );
  const scopedGiftUser = 618;
  await activateAccountStore(scopedGiftUser);
  await applyShopWallet(wallet(scopedGiftUser));
  const firstAdminGift: ShopPurchase = {
    ...giftReceipt,
    userId: scopedGiftUser,
    clientId: "scope-client",
    requestId: "shared-admin-id",
    adminUserId: 1,
    itemId: "tm",
    quantity: 1,
  };
  const secondAdminGift: ShopPurchase = {
    ...firstAdminGift,
    adminUserId: 2,
    purchaseId: "second-admin-gift",
    quantity: 2,
    walletRevision: 2,
  };
  const firstTerminal = { ...firstAdminGift, status: "applied" as const };
  const scopedMerge = mergeShopPurchases(
    [firstTerminal],
    [firstAdminGift, secondAdminGift],
  );
  assert.equal(scopedMerge.length, 2);
  assert.equal(
    scopedMerge.find((entry) => entry.adminUserId === 1)!.status,
    "applied",
  );
  assert.equal(
    scopedMerge.find((entry) => entry.adminUserId === 2)!.status,
    "pending",
  );
  assert.equal(
    mergeShopPurchases(scopedMerge, scopedMerge, {
      ...secondAdminGift,
      status: "applied",
    }).find((entry) => entry.adminUserId === 2)!.status,
    "applied",
  );
  await prepareShopParty(
    scopedGiftUser,
    "scope-client",
    "shared-admin-id",
    0,
    "gift",
    { adminUserId: 1, itemId: "tm", quantity: 1 },
  );
  await applyGiftPurchase(
    wallet(scopedGiftUser, 1, 500, { tm: 1 }),
    firstTerminal,
    "scope-client",
  );
  await prepareShopParty(
    scopedGiftUser,
    "scope-client",
    "shared-admin-id",
    1,
    "gift",
    { adminUserId: 2, itemId: "tm", quantity: 2 },
  );
  const scopedLockBefore = clone(saved(scopedGiftUser));
  await assert.rejects(
    applyGiftPurchase(
      wallet(scopedGiftUser, 2, 500, { tm: 3 }),
      firstTerminal,
      "scope-client",
    ),
    /no corresponde/,
  );
  assert.deepEqual(saved(scopedGiftUser), scopedLockBefore);
  await applyGiftPurchase(
    wallet(scopedGiftUser, 2, 500, { tm: 3 }),
    secondAdminGift,
    "scope-client",
  );
  await clearAccountStore();
  await activateAccountStore(scopedGiftUser);
  await applyGiftPurchase(
    wallet(scopedGiftUser, 2, 500, { tm: 3 }),
    { ...secondAdminGift, status: "applied" },
    "scope-client",
  );
  assert.equal(saved(scopedGiftUser).bag.items.tm, 3);
  assert.equal(saved(scopedGiftUser).bag.money, 500);
  assert.equal(saved(scopedGiftUser).shopLock, undefined);
  passed.push(
    "Two administrators may reuse the same request ID for distinct gifts: composite receipt merging preserves both identities and the second admin's reserved delivery survives reload without accepting the first admin's terminal proof",
  );
  const localUser = 620,
    localClient = "local-items-client";
  const { commitLocalItemUse } = await import("../src/lib/localItemUse");
  const { reservePvpParty, releasePvpParty } = await import(
    "../src/lib/pvpParty"
  );
  const faintedItemUser = 646, faintedItemClient = "fainted-item-client";
  await activateAccountStore(faintedItemUser);
  await applyShopWallet({
    ...wallet(faintedItemUser, 0, 500, { "full-restore": 2, "max-revive": 1 }),
    consumptionAck: { clientId: faintedItemClient, throughSequence: 0 },
  });
  await transactPvpParty(faintedItemUser, async (current) => {
    const actor = clone(legacyTeam[0]);
    actor.captureId = "fainted-item-target";
    actor.pokemon.stats.find((stat) => stat.name === "hp")!.value = 0;
    actor.statuses = ["poisoned"];
    actor.moves = [{ ...clone(trainerMoves.find((move) => move.id === 33)!), currentPp: 2 }];
    return { party: { ...current, pokemons: [actor], starterClaimed: true, gameSettings: clone(legacySettings) }, value: undefined };
  });
  const faintedItemBefore = clone(store.getState().party);
  const faintedItemDisk = testStorage.getItem(accountStorageKey(faintedItemUser));
  let invalidRevivalPlans = 0;
  const invalidRevivalPlan = async (current: typeof faintedItemBefore) => {
    invalidRevivalPlans++;
    const next = clone(current);
    next.pokemons[0].pokemon.stats.find((stat) => stat.name === "hp")!.value = getMaxHp(next.pokemons[0].pokemon)!;
    return next;
  };
  await assert.rejects(prepareItemUse(faintedItemUser, faintedItemClient, "rejected-legacy-revive", "fainted-item-target", 0,
    invalidRevivalPlan), /Max Revive/);
  await assert.rejects(commitLocalItemUse({ userId: faintedItemUser, clientId: faintedItemClient, operationId: "rejected-local-revive",
    itemId: "full-restore", captureId: "fainted-item-target", plan: invalidRevivalPlan }), /Max Revive/);
  assert.equal(invalidRevivalPlans, 0, "coordinators reject KO before trusting even a supplied revival plan");
  assert.deepEqual(store.getState().party, faintedItemBefore);
  assert.equal(testStorage.getItem(accountStorageKey(faintedItemUser)), faintedItemDisk,
    "no checked write, item-use lock, inventory debit, outbox, turn or PP change is allowed");
  await clearAccountStore();
  await activateAccountStore(faintedItemUser);
  assert.deepEqual(saved(faintedItemUser), faintedItemBefore);
  passed.push("Full Restore coordinators reject fainted targets with positive stock before calling a plan; HP/status/PP, money, inventory, pending intents and saved bytes remain unchanged through reload");
  const legacyRevivalPrepared = clone(faintedItemBefore);
  legacyRevivalPrepared.pokemons[0].pokemon.stats.find((stat) => stat.name === "hp")!.value = getMaxHp(legacyRevivalPrepared.pokemons[0].pokemon)!;
  legacyRevivalPrepared.pokemons[0].statuses = [];
  legacyRevivalPrepared.pokemons[0].statusTurns = {};
  const legacyRevivalHash = await itemUseHash(legacyRevivalPrepared);
  const legacyRevivalBytes = JSON.stringify(legacyRevivalPrepared);
  const legacyRevivalLock = {
    userId: faintedItemUser, clientId: faintedItemClient, requestId: "old-paid-revival", captureId: "fainted-item-target",
    itemId: "full-restore" as const, context: "party" as const, planHash: legacyRevivalHash,
    expectedWalletRevision: 0, expectedCombatHash: await itemUseHash(combatKey(faintedItemBefore)), prepared: legacyRevivalPrepared,
  };
  await transactPvpParty(faintedItemUser, async (current) => ({ party: { ...current, itemUseLock: legacyRevivalLock }, value: undefined }));
  await clearAccountStore();
  await activateAccountStore(faintedItemUser);
  assert.equal(store.getState().party.itemUseLock!.planHash, legacyRevivalHash);
  assert.equal(JSON.stringify(store.getState().party.itemUseLock!.prepared), legacyRevivalBytes);
  const legacyRevivalReceipt: ItemUse = {
    requestId: legacyRevivalLock.requestId, userId: faintedItemUser, clientId: faintedItemClient,
    itemId: "full-restore", captureId: "fainted-item-target", context: "party", planHash: legacyRevivalHash,
    expectedWalletRevision: 0, walletRevision: 1, status: "pending",
  };
  const legacyRevivalWallet = wallet(faintedItemUser, 1, 500, { "full-restore": 1, "max-revive": 1 });
  const legacyRevivalPending = clone(saved(faintedItemUser));
  testStorage.failWritesFor.add(accountStorageKey(faintedItemUser));
  await assert.rejects(applyItemUse(legacyRevivalWallet, legacyRevivalReceipt, faintedItemClient), /guardar/);
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(faintedItemUser), legacyRevivalPending);
  await applyItemUse(legacyRevivalWallet, legacyRevivalReceipt, faintedItemClient);
  assert.equal(getCurrentHp(saved(faintedItemUser).pokemons[0].pokemon), getMaxHp(faintedItemBefore.pokemons[0].pokemon));
  assert.equal(saved(faintedItemUser).pokemons[0].moves[0].currentPp, 2);
  assert.deepEqual(saved(faintedItemUser).pokemons[0].statuses, []);
  assert.equal(saved(faintedItemUser).bag.items["full-restore"], 1);
  assert.equal(saved(faintedItemUser).itemUseLock.planHash, legacyRevivalHash);
  assert.equal(JSON.stringify(saved(faintedItemUser).itemUseLock.prepared), legacyRevivalBytes);
  const legacyRevivalApplied = clone(saved(faintedItemUser));
  await applyItemUse(legacyRevivalWallet, legacyRevivalReceipt, faintedItemClient);
  assert.deepEqual(saved(faintedItemUser), legacyRevivalApplied);
  await applyItemUse(legacyRevivalWallet, { ...legacyRevivalReceipt, status: "applied" }, faintedItemClient);
  await clearAccountStore();
  await activateAccountStore(faintedItemUser);
  const legacyRevivalReleased = clone(saved(faintedItemUser));
  assert.equal(legacyRevivalReleased.itemUseLock, undefined);
  await applyItemUse(legacyRevivalWallet, legacyRevivalReceipt, faintedItemClient);
  assert.deepEqual(saved(faintedItemUser), legacyRevivalReleased);
  assert.equal(invalidRevivalPlans, 0, "already paid legacy plans recover their exact saved snapshot without evaluating a new Full Restore");
  passed.push("A previously paid legacy Full Restore revival keeps its original prepared bytes and hash across reload, recovers checked-write failure and applies exactly once without replanning or repeating its inventory debit");
  await activateAccountStore(localUser);
  const localWallet = (
    revision = 0,
    throughSequence = 0,
    items: Wallet["items"] = { "full-restore": 2, "max-ether": 2 },
  ): Wallet => ({
    ...wallet(localUser, revision, 500, items),
    consumptionAck: { clientId: localClient, throughSequence },
  });
  await applyShopWallet(localWallet());
  await transactPvpParty(localUser, async (current) => {
    const actor = clone(legacyTeam[0]);
    actor.captureId = "local-actor";
    actor.pokemon.stats.find((stat) => stat.name === "hp")!.value = 1;
    actor.moves = [
      { ...clone(trainerMoves.find((move) => move.id === 33)!), currentPp: 0 },
    ];
    return {
      party: {
        ...current,
        pokemons: [actor],
        gameSettings: clone(legacySettings),
      },
      value: undefined,
    };
  });
  const restoreLocal = (operationId: string) =>
    commitLocalItemUse({
      userId: localUser,
      clientId: localClient,
      operationId,
      itemId: "full-restore",
      captureId: "local-actor",
      plan: (party) => preparePartyItem(party, "local-actor", "full-restore"),
    });
  await restoreLocal("local-full-restore");
  await commitLocalItemUse({
    userId: localUser,
    clientId: localClient,
    operationId: "local-ether",
    itemId: "max-ether",
    captureId: "local-actor",
    moveId: 33,
    plan: (party) => preparePartyItem(party, "local-actor", "max-ether", 33),
  });
  const appliedLocal = clone(saved(localUser));
  assert.equal(appliedLocal.bag.items["full-restore"], 1);
  assert.equal(appliedLocal.bag.items["max-ether"], 1);
  assert.equal(appliedLocal.localItemOutbox.operations.length, 2);
  assert.equal(appliedLocal.itemUseLock, undefined);
  assert.equal(
    getCurrentHp(appliedLocal.pokemons[0].pokemon),
    getMaxHp(appliedLocal.pokemons[0].pokemon),
  );
  assert.equal(appliedLocal.pokemons[0].moves[0].currentPp, 35);
  await restoreLocal("local-full-restore");
  assert.deepEqual(
    saved(localUser),
    appliedLocal,
    "retrying a queued operation never applies its effect again",
  );
  const playablePendingHp = getCurrentHp(store.getState().party.pokemons[0].pokemon);
  store.dispatch(changePokemonHp({
    captureId: store.getState().party.pokemons[0].captureId, amount: -1,
  }));
  assert.equal(
    getCurrentHp(store.getState().party.pokemons[0].pokemon), playablePendingHp - 1,
    "the outbox is not a global Party lock",
  );
  await assert.rejects(
    prepareShopParty(localUser, localClient, "while-outbox", 0),
    /sincronicen/,
  );
  await assert.rejects(
    prepareGameReset(localUser, localClient, "reset-outbox", 0),
    /Sincroniza/,
  );
  await assert.rejects(
    previewCenterParty(localUser, localClient),
    /Sincroniza/,
  );
  await assert.rejects(
    reservePvpParty({
      userId: localUser,
      clientId: localClient,
      battleId: "outbox-battle",
    }),
    /Sincroniza/,
  );
  await applyShopWallet(localWallet());
  assert.equal(saved(localUser).bag.items["full-restore"], 1);
  assert.equal(
    getCurrentHp(saved(localUser).pokemons[0].pokemon), playablePendingHp - 1,
    "ordinary Party edits remain persisted while item synchronization is pending",
  );
  assert.equal(saved(localUser).bag.items["max-ether"], 1);
  const checkpointPokemons = clone(saved(localUser).pokemons);
  const beforeMissingAck = clone(saved(localUser));
  const missingAckWallet = localWallet(1, 1, {
    "full-restore": 1,
    "max-ether": 2,
  });
  delete missingAckWallet.consumptionAck;
  await applyShopWallet(missingAckWallet);
  assert.deepEqual(
    saved(localUser),
    beforeMissingAck,
    "an ambiguous wallet without ACK cannot prune or replace a pending local debit",
  );
  await applyShopWallet(
    localWallet(1, 1, { "full-restore": 1, "max-ether": 2 }),
  );
  assert.equal(saved(localUser).localItemOutbox.operations.length, 1);
  assert.equal(saved(localUser).bag.items["max-ether"], 1);
  await clearAccountStore();
  await activateAccountStore(localUser);
  await applyShopWallet(localWallet());
  assert.equal(
    saved(localUser).localItemOutbox.operations.length,
    1,
    "stale snapshots cannot revive an already accepted debit",
  );
  await applyShopWallet(
    localWallet(2, 2, { "full-restore": 1, "max-ether": 1 }),
  );
  assert.equal(saved(localUser).localItemOutbox.operations.length, 0);
  assert.equal(saved(localUser).localItemOutbox.nextSequence, 3);
  assert.deepEqual(saved(localUser).pokemons, checkpointPokemons);
  passed.push(
    "Instant local item effects and inventory debits persist together without a global lock; multiple uses survive reload and canonical snapshots subtract only unacknowledged operations without replaying effects",
  );
  await transactPvpParty(localUser, async (current) => {
    const next = clone(current);
    next.pokemons[0].pokemon.stats.find((stat) => stat.name === "hp")!.value =
      1;
    return { party: next, value: undefined };
  });
  const failedLocalBefore = clone(saved(localUser));
  testStorage.failWritesFor.add(accountStorageKey(localUser));
  await assert.rejects(restoreLocal("failed-local-write"), /guardar/);
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(localUser), failedLocalBefore);
  await restoreLocal("local-conflict");
  const pendingConflict = clone(saved(localUser));
  await applyShopWallet(
    localWallet(3, 2, { "full-restore": 0, "max-ether": 1 }),
  );
  assert.equal(saved(localUser).bag.items["full-restore"], 0);
  assert.equal(saved(localUser).localItemOutbox.operations.length, 1);
  const rejectedWallet = localWallet(3, 3, {
    "full-restore": 0,
    "max-ether": 1,
  });
  rejectedWallet.consumptionAck!.rejected = [
    {
      operationId: "local-conflict",
      sequence: 3,
      itemId: "full-restore",
      reason: "INSUFFICIENT_ITEMS",
    },
  ];
  await applyShopWallet(rejectedWallet);
  assert.equal(saved(localUser).localItemOutbox.operations.length, 0);
  assert.equal(saved(localUser).localItemConflicts.length, 1);
  assert.deepEqual(
    saved(localUser).pokemons,
    pendingConflict.pokemons,
    "a central stock conflict never rolls back played effects",
  );
  await applyShopWallet(rejectedWallet);
  assert.equal(saved(localUser).localItemConflicts.length, 1);
  await transactPvpParty(localUser, async (party) => ({
    party: { ...party, localItemConflicts: [] },
    value: undefined,
  }));
  await applyShopWallet(rejectedWallet);
  assert.deepEqual(saved(localUser).localItemConflicts, []);
  const terminalConsumption = clone(saved(localUser));
  await applyShopWallet(
    localWallet(3, 2, { "full-restore": 0, "max-ether": 1 }),
  );
  await applyShopWallet(
    localWallet(4, 2, { "full-restore": 0, "max-ether": 1 }),
  );
  assert.deepEqual(
    saved(localUser),
    terminalConsumption,
    "stale same-client ACK cannot lower a rejection watermark even at a newer wallet revision",
  );
  passed.push(
    "Checked-write failures spend nothing; another device can exhaust canonical stock and terminal rejections clear the outbox with one persistent notice while preserving the already played Party effect",
  );
  const consumptionSnapshot = await reservePvpParty({
    userId: localUser,
    clientId: localClient,
    battleId: "consumption-barrier",
  });
  assert.deepEqual(consumptionSnapshot.consumptionBarrier, {
    clientId: localClient,
    throughSequence: 3,
  });
  await releasePvpParty("consumption-barrier");
  await prepareGameReset(localUser, localClient, "local-reset", 3);
  const resetLocalWallet = localWallet(4, 3, {});
  resetLocalWallet.consumptionAck!.rejected =
    rejectedWallet.consumptionAck!.rejected;
  const resetLocalReceipt: GameReset = {
    requestId: "local-reset",
    userId: localUser,
    clientId: localClient,
    walletRevision: 4,
    status: "pending",
  };
  await applyGameReset(resetLocalWallet, resetLocalReceipt, localClient);
  await applyGameReset(
    resetLocalWallet,
    { ...resetLocalReceipt, status: "applied" },
    localClient,
  );
  assert.equal(saved(localUser).localItemOutbox.nextSequence, 4);
  assert.equal(saved(localUser).localItemOutbox.operations.length, 0);
  assert.equal(saved(localUser).bag.consumptionAck.throughSequence, 3);
  assert.equal(saved(localUser).pokemons.length, 0);
  assert.equal(
    saved(localUser).localItemConflicts?.length ?? 0,
    0,
    "reset never revives dismissed historical conflicts",
  );
  passed.push(
    "A confirmed game reset preserves the empty consumption stream counter and watermark so new uses cannot reuse already accepted sequence numbers",
  );
  await clearAccountStore();
  const rewardUser = 641;
  await activateAccountStore(rewardUser);
  const rewardWallet = (revision = 0, balance = 500, epoch = 7): Wallet => ({
    ...wallet(rewardUser, revision, balance),
    rewardEpoch: epoch,
  });
  assert.equal(validWallet(rewardWallet()), true);
  assert.equal(validWallet({ ...rewardWallet(), rewardEpoch: -1 }), false);
  assert.equal(validWallet({ ...rewardWallet(), rewardEpoch: 1.5 }), false);
  await applyShopWallet(rewardWallet());
  assert.equal(saved(rewardUser).bag.rewardEpoch, 7);
  const queueReward = () =>
    transactPvpParty(rewardUser, async (current) => {
      const next = clone(current);
      next.bag!.badges = ["cascade"];
      queueLocalTrainerReward(next, {
        kind: "trainer",
        encounterId: "vm-reward-encounter",
        rewards: { version: 1, color: "pink", epoch: 7 },
      } as Parameters<typeof queueLocalTrainerReward>[1]);
      return { party: next, value: undefined };
    });
  const beforeRewardWrite = clone(saved(rewardUser));
  testStorage.failWritesFor.add(accountStorageKey(rewardUser));
  await assert.rejects(queueReward(), /guardar/);
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(rewardUser), beforeRewardWrite);
  assert.deepEqual(
    store.getState().party,
    beforeRewardWrite,
    "a failed checked write exposes neither the completed-game edit nor its reward intent",
  );
  await queueReward();
  const queuedReward = clone(saved(rewardUser));
  assert.deepEqual(queuedReward.localRewardOutbox, [
    {
      encounterId: "vm-reward-encounter",
      epoch: 7,
      color: "pink",
    },
  ]);
  assert.equal(isLocalPartyMutationBlocked(store.getState().party), false);
  const staleRewardParty = clone(queuedReward);
  delete staleRewardParty.localRewardOutbox;
  staleRewardParty.bag.money = 9999;
  await accountStorage.setItem(
    "persist:root",
    encodeAccountParty(staleRewardParty),
  );
  assert.deepEqual(
    saved(rewardUser),
    queuedReward,
    "an equal-revision persistence callback cannot erase a pending combat reward",
  );
  await clearAccountStore();
  await activateAccountStore(rewardUser);
  assert.deepEqual(
    store.getState().party.localRewardOutbox,
    queuedReward.localRewardOutbox,
  );
  await applyShopWallet(rewardWallet(1, 700));
  assert.equal(saved(rewardUser).bag.money, 700);
  assert.deepEqual(
    saved(rewardUser).localRewardOutbox,
    queuedReward.localRewardOutbox,
    "a credited wallet alone is not proof to remove a specific queued reward",
  );
  const legacyRewardWallet = rewardWallet(1, 700);
  delete legacyRewardWallet.rewardEpoch;
  await applyShopWallet(legacyRewardWallet);
  assert.equal(
    saved(rewardUser).bag.rewardEpoch,
    7,
    "an older response without reward metadata cannot regress the saved game epoch",
  );
  await applyShopWallet(rewardWallet(1, 700, 6));
  assert.equal(saved(rewardUser).bag.rewardEpoch, 7);
  assert.deepEqual(
    saved(rewardUser).localRewardOutbox,
    queuedReward.localRewardOutbox,
  );
  passed.push(
    "Combat reward intents share checked persistence with the local result, remain playable, survive reload and equal-revision stale writes, and require an exact receipt rather than a wallet snapshot to disappear",
  );
  await prepareGameReset(rewardUser, "vm-reward-client", "vm-reward-reset", 1);
  const rewardReset: GameReset = {
    requestId: "vm-reward-reset",
    userId: rewardUser,
    clientId: "vm-reward-client",
    walletRevision: 2,
    status: "pending",
  };
  const rewardResetWallet = rewardWallet(2, 500, 8);
  await applyGameReset(rewardResetWallet, rewardReset, "vm-reward-client");
  await applyGameReset(
    rewardResetWallet,
    { ...rewardReset, status: "applied" },
    "vm-reward-client",
  );
  assert.equal(saved(rewardUser).bag.rewardEpoch, 8);
  assert.equal(saved(rewardUser).bag.money, 500);
  assert.equal(
    saved(rewardUser).localRewardOutbox?.length ?? 0,
    0,
    "an explicit confirmed new game discards unsent rewards from the old game",
  );
  await applyShopWallet(rewardWallet(1, 700, 7));
  assert.equal(saved(rewardUser).bag.rewardEpoch, 8);
  assert.equal(saved(rewardUser).bag.money, 500);
  await clearAccountStore();
  await activateAccountStore(rewardUser);
  assert.equal(saved(rewardUser).bag.rewardEpoch, 8);
  assert.equal(saved(rewardUser).localRewardOutbox?.length ?? 0, 0);
  passed.push(
    "A confirmed reset advances the combat-reward epoch, drops old unsent claims and prevents delayed older wallets from restoring the old balance or reward queue after reload",
  );
  await clearAccountStore();
  const legacyRewardUser = 642;
  await activateAccountStore(legacyRewardUser);
  await applyShopWallet({ ...wallet(legacyRewardUser), rewardEpoch: 0 });
  await transactPvpParty(legacyRewardUser, async (current) => {
    const actor = clone(legacyTeam[0]);
    if (!isLeveled(actor.pokemon))
      throw new Error("Legacy reward fixture needs a leveled Pokémon");
    const leveledActor = changeLevel(actor.pokemon, 20);
    actor.pokemon = leveledActor;
    actor.pokemon.stats.find((stat) => stat.name === "hp")!.value = 15;
    const foe = changeLevel(clone(leveledActor), 21);
    foe.stats.find((stat) => stat.name === "hp")!.value = 1;
    return {
      party: {
        ...current,
        pokemons: [actor],
        gameSettings: clone(legacySettings),
        starterClaimed: true,
        emerald: undefined,
        opponent: {
          encounterId: "vm-manual-reward",
          kind: "trainer",
          pokemon: foe,
          stages: neutralBattleStages(),
          statuses: [],
          statusTurns: {},
          rewards: { version: 1, color: "blue", epoch: 0 },
        },
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
  const manualBefore = clone(saved(legacyRewardUser));
  const manualKo = changeOpponentHp({
    amount: -1,
    expectedOpponent: JSON.stringify([
      manualBefore.opponent.encounterId,
      manualBefore.opponent.pokemon.id,
      manualBefore.opponent.kind,
    ]),
  });
  let visibleManualReward = 0;
  const unsubscribeManualReward = store.subscribe(() => {
    if (store.getState().party.localRewardOutbox?.length) visibleManualReward++;
  });
  testStorage.failWritesFor.add(accountStorageKey(legacyRewardUser));
  await assert.rejects(
    store.dispatch(submitLegacyBattleAction(manualKo)),
    /guardar/,
  );
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(legacyRewardUser), manualBefore);
  assert.deepEqual(store.getState().party, manualBefore);
  assert.equal(
    visibleManualReward,
    0,
    "a background reward subscriber cannot see an unpersisted manual KO",
  );
  await store.dispatch(submitLegacyBattleAction(manualKo));
  unsubscribeManualReward();
  const manualAfter = clone(saved(legacyRewardUser));
  assert.equal(
    manualAfter.opponent.pokemon.stats.find(
      (stat: { name: string }) => stat.name === "hp",
    ).value,
    0,
  );
  assert.equal(manualAfter.pokemons[0].pokemon.level, 22);
  assert.deepEqual(manualAfter.localRewardOutbox, [
    {
      encounterId: "vm-manual-reward",
      epoch: 0,
      color: "blue",
    },
  ]);
  assert.deepEqual(
    manualAfter.pokemons[0].moves,
    manualBefore.pokemons[0].moves,
  );
  assert.equal(manualAfter.bag.money, 500);
  assert(visibleManualReward > 0);
  await clearAccountStore();
  await activateAccountStore(legacyRewardUser);
  await store.dispatch(submitLegacyBattleAction(manualKo));
  assert.deepEqual(saved(legacyRewardUser).pokemons, manualAfter.pokemons);
  assert.deepEqual(
    saved(legacyRewardUser).localRewardOutbox,
    manualAfter.localRewardOutbox,
  );
  passed.push(
    "Legacy manual KOs use checked persistence before subscribers can claim money: quota failure reveals no KO, level or claim; retry saves all three once, preserving PP through reload and action replay",
  );
  await clearAccountStore();
  const lossUser = 644;
  const lossClient = "vm-loss-client";
  const lossWallet = (revision = 0, balance = 500): Wallet => ({
    ...wallet(lossUser, revision, balance, { "full-restore": 1 }),
    rewardEpoch: 0,
    consumptionAck: { clientId: lossClient, throughSequence: 0 },
  });
  await activateAccountStore(lossUser);
  await applyShopWallet(lossWallet());
  await transactPvpParty(lossUser, async (current) => {
    const actor = clone(legacyTeam[0]);
    if (!isLeveled(actor.pokemon))
      throw new Error("Loss fixture needs a leveled Pokémon");
    const lossPokemon = changeLevel(actor.pokemon, 20);
    actor.pokemon = lossPokemon;
    actor.pokemon.stats.find((stat) => stat.name === "hp")!.value = 15;
    actor.moves = [{ ...clone(trainerMoves.find((move) => move.id === 33)!), currentPp: 0 }];
    actor.statuses = ["poisoned"];
    const foe = changeLevel(clone(lossPokemon), 21);
    foe.stats.find((stat) => stat.name === "hp")!.value = 30;
    return {
      party: {
        ...current,
        pokemons: [actor],
        gameSettings: clone(legacySettings),
        starterClaimed: true,
        emerald: undefined,
        opponent: {
          encounterId: "vm-manual-loss", kind: "trainer", pokemon: foe,
          stages: neutralBattleStages(), statuses: [], statusTurns: {},
          rewards: { version: 1, lossPenaltyVersion: 1, color: "blue", epoch: 0 },
        },
        battleField: {
          version: 1, turn: 1, activeCaptureId: actor.captureId,
          weather: null, waterSport: null, mudSport: null,
        },
      },
      value: undefined,
    };
  });
  const lossBefore = clone(saved(lossUser));
  const finalPlayerKo = changePokemonHp({
    captureId: lossBefore.pokemons[0].captureId, amount: -15,
  });
  let visibleUnpersistedLoss = 0;
  const unsubscribeLoss = store.subscribe(() => {
    if (store.getState().party.localRewardOutbox?.length) visibleUnpersistedLoss++;
  });
  testStorage.failWritesFor.add(accountStorageKey(lossUser));
  await assert.rejects(store.dispatch(submitLegacyBattleAction(finalPlayerKo)), /guardar/);
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(lossUser), lossBefore);
  assert.deepEqual(store.getState().party, lossBefore);
  assert.equal(visibleUnpersistedLoss, 0,
    "background subscribers never see a loss or debit claim that failed checked persistence");
  await store.dispatch(submitLegacyBattleAction(finalPlayerKo));
  unsubscribeLoss();
  const lossAfter = clone(saved(lossUser));
  assert.equal(getCurrentHp(lossAfter.pokemons[0].pokemon), 0);
  assert.equal(lossAfter.opponent.rewards.outcome, "lose");
  assert.deepEqual(lossAfter.localRewardOutbox, [{
    encounterId: "vm-manual-loss", epoch: 0, color: "blue", penaltyVersion: 1,
  }]);
  assert.equal(lossAfter.bag.money, 500, "the local result never guesses or deducts central money");
  assert.equal(lossAfter.pokemons[0].pokemon.level, 20);
  assert.deepEqual(lossAfter.pokemons[0].moves, lossBefore.pokemons[0].moves);
  assert.deepEqual(lossAfter.pokemons[0].statuses, ["poisoned"]);
  assert.equal(isLocalPartyMutationBlocked(store.getState().party), false);
  await assert.rejects(prepareShopParty(lossUser, lossClient, "buy-before-loss-sync", 0), /Pokedollars del combate/);
  await clearAccountStore();
  await activateAccountStore(lossUser);
  assert.deepEqual(saved(lossUser).localRewardOutbox, lossAfter.localRewardOutbox);
  assert.equal(saved(lossUser).opponent.rewards.outcome, "lose");
  await store.dispatch(submitLegacyBattleAction(finalPlayerKo));
  assert.deepEqual(saved(lossUser).localRewardOutbox, lossAfter.localRewardOutbox,
    "replaying the manual HP action after reload cannot enqueue a second loss");
  passed.push(
    "A manual final Party KO saves the terminal loss and penalty intent together; quota failure publishes neither, retry/reload preserve one claim with HP/PP/status and unchanged central money, and purchases wait for settlement",
  );
  const lossReceipt: CombatReward = {
    rewardId: "local:vm-manual-loss", userId: lossUser, source: "local-trainer",
    encounterId: "vm-manual-loss", epoch: 0, color: "blue", penaltyVersion: 1,
    nominalAmount: 200, amount: 200, walletRevision: 1, status: "debited",
    balanceBefore: 500, balanceAfter: 300,
  };
  await applyShopWallet(lossWallet(1, 300));
  assert.equal(saved(lossUser).bag.money, 300);
  assert.deepEqual(saved(lossUser).localRewardOutbox, lossAfter.localRewardOutbox,
    "a debited wallet snapshot by itself cannot acknowledge a particular loss");
  await applyShopWallet(lossWallet(2, 900));
  const acknowledgeLoss = () => transactPvpParty(lossUser, async (current) => {
    const projected = partyWithWallet(current, lossWallet(1, 300));
    return {
      party: {
        ...projected,
        pvpRevision: (projected.pvpRevision ?? 0) + 1,
        localRewardOutbox: (projected.localRewardOutbox ?? []).filter(
          (claim) => !matchingLocalReward(claim, lossReceipt, lossUser),
        ),
      },
      value: undefined,
    };
  });
  const beforeLossAck = clone(saved(lossUser));
  testStorage.failWritesFor.add(accountStorageKey(lossUser));
  await assert.rejects(acknowledgeLoss(), /guardar/);
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(lossUser), beforeLossAck);
  assert.deepEqual(store.getState().party, beforeLossAck);
  await acknowledgeLoss();
  assert.equal(saved(lossUser).bag.money, 900,
    "a late loss receipt clears its exact intent without regressing a newer canonical balance");
  assert.equal(saved(lossUser).localRewardOutbox.length, 0);
  assert.equal(saved(lossUser).opponent.rewards.outcome, "lose");
  await clearAccountStore();
  await activateAccountStore(lossUser);
  await store.dispatch(submitLegacyBattleAction(setBattleOpponent(null)));
  assert.equal(saved(lossUser).opponent, null);
  assert.equal(saved(lossUser).localRewardOutbox.length, 0,
    "removing a completed trainer after ACK and reload cannot charge the same loss again");
  assert.equal(saved(lossUser).bag.money, 900);
  assert.deepEqual(saved(lossUser).pokemons, lossAfter.pokemons);
  passed.push(
    "Only the exact terminal loss receipt clears its queue through checked persistence; stale debit snapshots cannot replace newer money, and removing the defeated player's trainer after ACK/reload never requeues a penalty",
  );
  await clearAccountStore();
  const forfeitUser = 645;
  const forfeitClient = "vm-forfeit-client";
  await activateAccountStore(forfeitUser);
  await applyShopWallet({
    ...wallet(forfeitUser, 0, 500, { "full-restore": 1 }), rewardEpoch: 0,
    consumptionAck: { clientId: forfeitClient, throughSequence: 0 },
  });
  await transactPvpParty(forfeitUser, async (current) => ({
    party: {
      ...current, gameSettings: clone(legacySettings), starterClaimed: true,
      pokemons: clone(lossBefore.pokemons),
      opponent: {
        ...clone(lossBefore.opponent), encounterId: "vm-forfeit-loss",
        rewards: { version: 1, lossPenaltyVersion: 1, color: "red", epoch: 0 },
      },
      battleField: clone(lossBefore.battleField),
    },
    value: undefined,
  }));
  await store.dispatch(submitLegacyBattleAction(setBattleOpponent(null)));
  const forfeited = clone(saved(forfeitUser));
  assert.deepEqual(forfeited.localRewardOutbox, [{
    encounterId: "vm-forfeit-loss", epoch: 0, color: "red", penaltyVersion: 1,
  }]);
  await assert.rejects(prepareShopParty(forfeitUser, forfeitClient, "gift-before-forfeit-sync", 0, "gift", {
    adminUserId: 1, itemId: "tm", quantity: 1,
  }), /Pokedollars del combate/);
  await commitLocalItemUse({
    userId: forfeitUser, clientId: forfeitClient, operationId: "restore-with-loss-pending",
    itemId: "full-restore", captureId: forfeited.pokemons[0].captureId,
    plan: (party) => preparePartyItem(party, forfeited.pokemons[0].captureId, "full-restore"),
  });
  assert.equal(getCurrentHp(saved(forfeitUser).pokemons[0].pokemon), getMaxHp(saved(forfeitUser).pokemons[0].pokemon));
  assert.deepEqual(saved(forfeitUser).pokemons[0].statuses, []);
  assert.equal(saved(forfeitUser).bag.items["full-restore"], 0);
  assert.equal(saved(forfeitUser).localItemOutbox.operations.length, 1);
  assert.deepEqual(saved(forfeitUser).localRewardOutbox, forfeited.localRewardOutbox);
  assert.equal(saved(forfeitUser).bag.money, 500);
  assert.equal(isLocalPartyMutationBlocked(store.getState().party), false);
  passed.push(
    "A trainer forfeit queues its penalty durably but remains playable: pending money prevents new purchases or gifts while a locally owned Full Restore heals and spends one inventory item immediately without waiting for either network acknowledgement",
  );
  await clearAccountStore();
  const gymRewardUser = 643;
  await activateAccountStore(gymRewardUser);
  await transactPvpParty(gymRewardUser, async (current) => ({
    party: { ...current, bag: { ...current.bag!, badges: ["cascade"] } },
    value: undefined,
  }));
  const gymWallet = (
    revision: number, balance: number, tm: number, badges: Wallet["badges"],
  ): Wallet => ({
    ...wallet(gymRewardUser, revision, balance, tm ? { tm } : {}),
    rewardEpoch: 0, badges,
  });
  await applyShopWallet(gymWallet(0, 500, 0, []));
  assert.deepEqual(saved(gymRewardUser).bag.badges, ["cascade"],
    "the first canonical badge snapshot preserves a manually earned legacy badge");
  assert.deepEqual(saved(gymRewardUser).bag.rewardBadges, []);
  assert.equal(validWallet(gymWallet(1, 1700, 1, ["boulder"])), true);
  assert.equal(validWallet(gymWallet(1, 1700, 1, ["boulder", "boulder"])), false);
  assert.equal(validWallet({ ...gymWallet(1, 1700, 1, []), badges: ["unknown-badge"] }), false);
  const beforeGymBundle = clone(saved(gymRewardUser));
  testStorage.failWritesFor.add(accountStorageKey(gymRewardUser));
  await assert.rejects(applyShopWallet(gymWallet(1, 1700, 1, ["boulder"])), /guardar/);
  testStorage.failWritesFor.clear();
  assert.deepEqual(saved(gymRewardUser), beforeGymBundle,
    "a failed checked save reveals neither the gym cash nor the TM/badge bundle");
  await applyShopWallet(gymWallet(1, 1700, 1, ["boulder"]));
  const gymBundleSaved = clone(saved(gymRewardUser));
  assert.equal(gymBundleSaved.bag.money, 1700);
  assert.equal(gymBundleSaved.bag.items.tm, 1);
  assert.deepEqual(new Set(gymBundleSaved.bag.badges), new Set(["cascade", "boulder"]));
  assert.deepEqual(gymBundleSaved.bag.rewardBadges, ["boulder"]);
  await applyShopWallet(gymWallet(1, 1700, 1, ["boulder"]));
  assert.deepEqual(saved(gymRewardUser), gymBundleSaved,
    "a replayed gym snapshot never adds another TM or another badge");
  await clearAccountStore();
  await activateAccountStore(gymRewardUser);
  const legacyGymWallet = gymWallet(2, 1700, 1, ["boulder"]);
  delete legacyGymWallet.badges;
  await applyShopWallet(legacyGymWallet);
  assert.deepEqual(saved(gymRewardUser).bag.rewardBadges, ["boulder"]);
  assert.deepEqual(new Set(saved(gymRewardUser).bag.badges), new Set(["cascade", "boulder"]),
    "an older wallet without badge metadata cannot erase either confirmed or legacy badges");
  await applyShopWallet(gymWallet(3, 2900, 2, ["boulder"]));
  assert.equal(saved(gymRewardUser).bag.money, 2900);
  assert.equal(saved(gymRewardUser).bag.items.tm, 2,
    "a separate repeated gym victory adds its new canonical TM quantity");
  assert.equal(saved(gymRewardUser).bag.badges.filter((badge: string) => badge === "boulder").length, 1);
  assert(saved(gymRewardUser).bag.badges.includes("cascade"));
  passed.push(
    "Gym cash, one canonical TM and a unique badge share checked wallet persistence; replay and reload never add extras, repeated victories add a TM and legacy manually earned badges remain preserved",
  );
  await prepareGameReset(gymRewardUser, "vm-gym-client", "vm-gym-reset", 3);
  const gymResetReceipt: GameReset = {
    requestId: "vm-gym-reset", userId: gymRewardUser, clientId: "vm-gym-client",
    walletRevision: 4, status: "pending",
  };
  const gymResetWallet: Wallet = { ...gymWallet(4, 500, 0, []), rewardEpoch: 1 };
  await applyGameReset(gymResetWallet, gymResetReceipt, "vm-gym-client");
  await applyGameReset(gymResetWallet, { ...gymResetReceipt, status: "applied" }, "vm-gym-client");
  assert.equal(saved(gymRewardUser).bag.money, 500);
  assert.deepEqual(saved(gymRewardUser).bag.items, {});
  assert.deepEqual(saved(gymRewardUser).bag.badges, []);
  assert.deepEqual(saved(gymRewardUser).bag.rewardBadges, []);
  await applyShopWallet(gymWallet(3, 2900, 2, ["boulder"]));
  await clearAccountStore();
  await activateAccountStore(gymRewardUser);
  assert.deepEqual(saved(gymRewardUser).bag.badges, []);
  assert.deepEqual(saved(gymRewardUser).bag.items, {});
  passed.push(
    "A confirmed new game clears canonical and legacy badges plus rewarded TMs, and delayed old wallet snapshots cannot restore the gym bundle after reset/reload",
  );
  await clearAccountStore();
  persistor.pause();
  await persistor.flush();
  return passed;
}
