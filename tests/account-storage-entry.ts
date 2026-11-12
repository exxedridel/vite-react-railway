import assert from "node:assert/strict";
import partyReducer, {
  addPokemon,
  changeBagMoney,
  configureGame,
  toggleGymBadge,
} from "../src/slices/partySlice";
import { STAT_NAMES } from "../src/lib/pokemonStats";
import type { Pokemon } from "../src/types/pokemon";
import {
  accountStorageKey,
  accountNicknameKey,
  getActiveAccountId,
  getStoredNickname,
  LEGACY_PARTY_KEY,
  LEGACY_PARTY_BACKUP_KEY,
  LEGACY_PARTY_OWNER_KEY,
  LEGACY_PARTY_RESERVATION_KEY,
  LEGACY_NICKNAME_KEY,
  PVP_PARTY_COMMIT,
  setShopSyncBlocked,
} from "../src/store/accountStorage";

declare const testStorage: {
  getItem(key: string): string | null;
  seed(key: string, value: string): void;
  removeItem(key: string): void;
  failWritesFor: Set<string>;
  readKeys: string[];
  writeKeys: string[];
};

function pokemon(id: number, name: string): Pokemon {
  return {
    id,
    name,
    image: null,
    types: ["normal"],
    stats: STAT_NAMES.map((stat) => ({ name: stat, value: 50 })),
    learnset: { versionGroup: "emerald", moves: [{ id: 33, name: "tackle" }] },
  };
}

function fixtureParty(id: number, name: string, money: number) {
  let party = partyReducer(undefined, { type: "test/init" });
  party = partyReducer(
    party,
    configureGame({ regions: ["kanto"], startingLevel: 5, hpMultiplier: 1.3 }),
  );
  party = partyReducer(party, addPokemon(pokemon(id, name)));
  return { ...party, bag: { ...party.bag!, money } };
}

function savedParty(userId: number) {
  const raw = testStorage.getItem(accountStorageKey(userId));
  assert.ok(raw, `Account ${userId} must have a saved party`);
  return JSON.parse(JSON.parse(raw).party);
}

export async function runAccountStorageTests() {
  const passed: string[] = [];
  const legacy = fixtureParty(1, "bulbasaur", 999);
  const legacyRaw = JSON.stringify({
    party: JSON.stringify(legacy),
    _persist: JSON.stringify({ version: -1, rehydrated: true }),
  });
  testStorage.seed(LEGACY_PARTY_KEY, legacyRaw);
  testStorage.seed(LEGACY_NICKNAME_KEY, "Entrenador anterior");
  testStorage.seed("bearer_token", "unverified-test-token-not-a-real-session");
  testStorage.readKeys.length = 0;
  testStorage.writeKeys.length = 0;
  // Import lazily: the legacy save already exists when the real singleton boots.
  const {
    store,
    persistor,
    activateAccountStore,
    clearAccountStore,
    hasLegacyPartyForImport,
    importLegacyParty,
  } = await import("../src/store/store");
  if (!persistor.getState().bootstrapped) {
    await new Promise<void>((resolve) => {
      const unsubscribe = persistor.subscribe(() => {
        if (!persistor.getState().bootstrapped) return;
        unsubscribe();
        resolve();
      });
    });
  }
  await persistor.flush();
  assert.equal(getActiveAccountId(), null);
  assert.equal(store.getState().party.pokemons.length, 0);
  assert.equal(
    testStorage.readKeys.length,
    0,
    "Boot must not inspect legacy, account saves or the unverified token",
  );
  assert.equal(
    testStorage.writeKeys.length,
    0,
    "Boot must not create or replace a saved party",
  );
  passed.push("unverified boot never reads or writes a saved party");

  const a = 101,
    b = 202,
    importer = 303,
    other = 404;
  await activateAccountStore(a);
  store.dispatch(
    configureGame({ regions: ["kanto"], startingLevel: 5, hpMultiplier: 1.3 }),
  );
  store.dispatch(addPokemon(pokemon(4, "charmander")));
  store.dispatch({
    type: PVP_PARTY_COMMIT,
    payload: {
      ...store.getState().party,
      bag: { ...store.getState().party.bag!, money: 123 },
    },
  });
  testStorage.seed(accountNicknameKey(a), "Cuenta A");
  const aCaptureId = store.getState().party.pokemons[0].captureId;
  const { pokeApi } = await import("../src/api/pokeApi");
  await store.dispatch(
    pokeApi.util.upsertQueryData("getPokemon", "4", pokemon(4, "charmander")),
  );
  assert.ok(
    Object.keys(store.getState()[pokeApi.reducerPath].queries).length > 0,
  );
  // No manual flush: switching must save A's queued party before selecting B.
  await activateAccountStore(b);
  assert.equal(store.getState().party.pokemons.length, 0);
  assert.equal(store.getState().party.bag?.money, 500);
  assert.equal(getStoredNickname(b), "");
  assert.equal(
    Object.keys(store.getState()[pokeApi.reducerPath].queries).length,
    0,
    "Account switches reset API caches",
  );
  assert.equal(savedParty(a).pokemons[0].captureId, aCaptureId);
  assert.equal(savedParty(a).bag.money, 123);
  store.dispatch(
    configureGame({ regions: ["kanto"], startingLevel: 5, hpMultiplier: 1.3 }),
  );
  store.dispatch(addPokemon(pokemon(7, "squirtle")));
  store.dispatch({
    type: PVP_PARTY_COMMIT,
    payload: {
      ...store.getState().party,
      bag: { ...store.getState().party.bag!, money: 456 },
    },
  });
  await activateAccountStore(a);
  assert.equal(store.getState().party.pokemons[0].captureId, aCaptureId);
  assert.equal(store.getState().party.bag?.money, 123);
  assert.equal(getStoredNickname(a), "Cuenta A");
  assert.equal(savedParty(b).pokemons[0].pokemon.id, 7);
  assert.equal(savedParty(b).bag.money, 456);
  passed.push(
    "queued writes, team, bag, nickname and API caches remain isolated across A/B switches",
  );

  const savedA = testStorage.getItem(accountStorageKey(a));
  const savedB = testStorage.getItem(accountStorageKey(b));
  await clearAccountStore();
  assert.equal(getActiveAccountId(), null);
  assert.equal(store.getState().party.pokemons.length, 0);
  assert.equal(store.getState().party.bag?.money, 500);
  store.dispatch(changeBagMoney({ amount: 999, direction: "add" }));
  await persistor.flush();
  assert.equal(testStorage.getItem(accountStorageKey(a)), savedA);
  assert.equal(testStorage.getItem(accountStorageKey(b)), savedB);
  assert.equal(testStorage.getItem(LEGACY_PARTY_KEY), legacyRaw);
  await activateAccountStore(a);
  assert.equal(store.getState().party.bag?.money, 123);
  passed.push(
    "logout clears memory without deleting saves, and ownerless actions cannot overwrite them",
  );

  await activateAccountStore(importer);
  const { applyShopWallet, prepareShopParty } = await import(
    "../src/lib/shop/wallet"
  );
  const importedWallet = {
    userId: importer,
    currencyVersion: 1 as const,
    revision: 4,
    balance: 500,
    items: { "great-ball": 1 },
  };
  await applyShopWallet(importedWallet);
  assert.equal(
    store.getState().party.pokemons.length,
    0,
    "Login never assigns legacy automatically",
  );
  assert.equal(
    getStoredNickname(importer),
    "",
    "Legacy nickname requires the same explicit opt-in",
  );
  assert.equal(await hasLegacyPartyForImport(importer), true);
  assert.equal(testStorage.getItem(LEGACY_PARTY_OWNER_KEY), null);
  setShopSyncBlocked(true);
  assert.equal(await hasLegacyPartyForImport(importer), false);
  await assert.rejects(importLegacyParty(importer), /reservada/);
  setShopSyncBlocked(false);
  await prepareShopParty(importer, "import-client", "import-pending", 4);
  assert.equal(await hasLegacyPartyForImport(importer), false);
  await assert.rejects(importLegacyParty(importer), /reservada/);
  await applyShopWallet(importedWallet, [], {
    abortUnlockRequestId: "import-pending",
  });
  const foreignLegacy = {
    ...legacy,
    shopLock: {
      userId: 9999,
      clientId: "foreign-client",
      requestId: "foreign-purchase",
    },
  };
  testStorage.seed(
    LEGACY_PARTY_KEY,
    JSON.stringify({ party: JSON.stringify(foreignLegacy) }),
  );
  await assert.rejects(importLegacyParty(importer), /compra pendiente/);
  testStorage.seed(LEGACY_PARTY_KEY, legacyRaw);
  const expectedImported = {
    ...JSON.parse(JSON.stringify(legacy)),
    pvpRevision: (store.getState().party.pvpRevision ?? 0) + 1,
    bag: {
      ...JSON.parse(JSON.stringify(store.getState().party.bag)),
      badges: legacy.bag.badges,
    },
  };
  await importLegacyParty(importer);
  assert.deepEqual(
    JSON.parse(JSON.stringify(store.getState().party)),
    expectedImported,
  );
  assert.deepEqual(savedParty(importer), expectedImported);
  assert.equal(
    savedParty(importer).bag.money,
    500,
    "legacy money never replaces a confirmed wallet",
  );
  assert.deepEqual(savedParty(importer).bag.items, { "great-ball": 1 });
  assert.equal(savedParty(importer).bag.walletRevision, 4);
  assert.equal(testStorage.getItem(LEGACY_PARTY_KEY), legacyRaw);
  assert.equal(testStorage.getItem(LEGACY_PARTY_BACKUP_KEY), legacyRaw);
  assert.equal(testStorage.getItem(LEGACY_PARTY_OWNER_KEY), String(importer));
  assert.equal(getStoredNickname(importer), "Entrenador anterior");
  assert.equal(getStoredNickname(a), "Cuenta A");
  await activateAccountStore(other);
  assert.equal(await hasLegacyPartyForImport(other), false);
  await assert.rejects(importLegacyParty(other), /vinculada|importada/);
  assert.equal(store.getState().party.pokemons.length, 0);
  assert.equal(testStorage.getItem(LEGACY_PARTY_KEY), legacyRaw);
  passed.push(
    "legacy import is explicit, preserves canonical wallet/items, blocks purchase locks and can be claimed by only one account",
  );

  const corruptId = 909;
  const corrupt = '{"party":"not valid JSON"}';
  testStorage.seed(accountStorageKey(corruptId), corrupt);
  await assert.rejects(
    activateAccountStore(corruptId),
    /interpretar|recuperar/,
  );
  assert.equal(getActiveAccountId(), null);
  assert.equal(store.getState().party.pokemons.length, 0);
  assert.equal(testStorage.getItem(accountStorageKey(corruptId)), corrupt);
  assert.equal(
    testStorage.writeKeys.includes(accountStorageKey(corruptId)),
    false,
  );
  assert.equal(testStorage.getItem(accountStorageKey(a)), savedA);
  assert.equal(testStorage.getItem(accountStorageKey(b)), savedB);
  passed.push(
    "corrupt saves fail closed without being overwritten by an empty party",
  );

  await activateAccountStore(a);
  store.dispatch(toggleGymBadge("cascade"));
  testStorage.failWritesFor.add(accountStorageKey(a));
  await assert.rejects(activateAccountStore(b), /guardar/);
  assert.equal(getActiveAccountId(), null);
  assert.equal(store.getState().party.pokemons.length, 0);
  assert.equal(testStorage.getItem(accountStorageKey(a)), savedA);
  assert.equal(testStorage.getItem(accountStorageKey(b)), savedB);
  testStorage.failWritesFor.clear();
  await activateAccountStore(a);
  assert.equal(
    store.getState().party.bag?.money,
    123,
    "Failed writes must not masquerade as saved progress",
  );
  store.dispatch(toggleGymBadge("cascade"));
  testStorage.failWritesFor.add(accountStorageKey(a));
  await assert.rejects(clearAccountStore(), /guardar/);
  assert.equal(getActiveAccountId(), null);
  assert.equal(store.getState().party.pokemons.length, 0);
  assert.equal(testStorage.getItem(accountStorageKey(a)), savedA);
  testStorage.failWritesFor.clear();
  passed.push(
    "storage failures reject transitions/logout explicitly while preserving previous saves and hiding memory",
  );

  // Simulate a fresh unclaimed migration with a quota failure on its final marker.
  // These are fake in-memory keys only; no real browser storage is accessed.
  testStorage.removeItem(LEGACY_PARTY_OWNER_KEY);
  testStorage.removeItem(LEGACY_PARTY_RESERVATION_KEY);
  const partialImporter = 505,
    blockedImporter = 606;
  await activateAccountStore(partialImporter);
  const expectedPartial = {
    ...JSON.parse(JSON.stringify(legacy)),
    pvpRevision: 1,
    bag: {
      money: 500,
      badges: legacy.bag.badges,
      items: {},
      currencyVersion: 1,
    },
  };
  testStorage.failWritesFor.add(LEGACY_PARTY_OWNER_KEY);
  await assert.rejects(importLegacyParty(partialImporter), /guardar/);
  assert.equal(testStorage.getItem(LEGACY_PARTY_OWNER_KEY), null);
  assert.equal(
    testStorage.getItem(LEGACY_PARTY_RESERVATION_KEY),
    String(partialImporter),
  );
  assert.deepEqual(savedParty(partialImporter), expectedPartial);
  assert.equal(testStorage.getItem(LEGACY_PARTY_KEY), legacyRaw);
  testStorage.failWritesFor.clear();
  await activateAccountStore(blockedImporter);
  assert.equal(await hasLegacyPartyForImport(blockedImporter), false);
  await assert.rejects(
    importLegacyParty(blockedImporter),
    /vinculada|importada/,
  );
  await activateAccountStore(partialImporter);
  assert.equal(
    await hasLegacyPartyForImport(partialImporter),
    true,
    "A reserved partial import must remain recoverable after reactivation",
  );
  await importLegacyParty(partialImporter);
  assert.equal(
    testStorage.getItem(LEGACY_PARTY_OWNER_KEY),
    String(partialImporter),
  );
  assert.deepEqual(savedParty(partialImporter), expectedPartial);
  passed.push(
    "a partial legacy import remains reserved, blocks a second claimant and can finish safely on retry",
  );

  await clearAccountStore();
  persistor.pause();
  await persistor.flush();
  return passed;
}
