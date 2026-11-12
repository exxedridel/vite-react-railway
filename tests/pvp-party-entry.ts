import assert from "node:assert/strict";
import partyReducer, {
  addPokemon,
  configureGame,
  changeBagMoney,
  changePokemonHp,
  resetGame,
} from "../src/slices/partySlice";
import { getCurrentHp } from "../src/lib/pokemonStats";
import {
  accountStorage,
  accountStorageKey,
  encodeAccountParty,
  PVP_PARTY_COMMIT,
} from "../src/store/accountStorage";
import type { PartyState } from "../src/slices/partySlice";
import type { PvpResult } from "../src/lib/pvp/types";
declare const testStorage: {
  getItem(key: string): string | null;
  seed(key: string, value: string): void;
  failWritesFor: Set<string>;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture(): PartyState {
  let party = partyReducer(undefined, { type: "init" });
  party = partyReducer(
    party,
    configureGame({ regions: ["kanto"], startingLevel: 20, hpMultiplier: 1.3 }),
  );
  party = clone(
    partyReducer(
      party,
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
    ),
  );
  const capture = party.pokemons[0];
  capture.moves = [
    {
      id: 33,
      name: "tackle",
      displayName: "Tackle",
      type: "normal",
      damageClass: "physical",
      power: 35,
      accuracy: 95,
      pp: 35,
      priority: 0,
      description: "Test",
      source: "starter",
    },
  ];
  capture.pokemon.stats.find((stat) => stat.name === "hp")!.value = 17;
  capture.statuses = ["burned", "confused"];
  capture.statusTurns = { confused: 2 };
  party.bag = { money: 77, badges: ["boulder"] };
  return party;
}
function saved(id: number): PartyState {
  return JSON.parse(
    JSON.parse(testStorage.getItem(accountStorageKey(id))!).party,
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
  const {
    reservePvpParty,
    applyPvpResult,
    releasePvpParty,
    recoverPvpPartyLock,
    syncPvpSavedParty,
    setPvpSyncBlocked,
  } = await import("../src/lib/pvpParty");
  const id = 2001,
    other = 2002,
    passed: string[] = [];
  const original = fixture();
  testStorage.seed(accountStorageKey(id), encodeAccountParty(original));
  await activateAccountStore(id);
  setPvpSyncBlocked(true);
  store.dispatch(changeBagMoney({ amount: 10, direction: "add" }));
  assert.equal(store.getState().party.bag!.money, 77);
  setPvpSyncBlocked(false);
  const snapshot = await reservePvpParty({
    battleId: "battle-1",
    userId: id,
    clientId: "client-owner",
  });
  assert.equal(snapshot.pokemons.length, 1);
  assert.equal(getCurrentHp(snapshot.pokemons[0].pokemon), 17);
  assert.deepEqual(snapshot.pokemons[0].statuses, ["burned", "confused"]);
  assert.equal(snapshot.baseHash.length, 64);
  const reserved = clone(store.getState().party);
  store.dispatch(resetGame());
  store.dispatch(changeBagMoney({ amount: 300, direction: "add" }));
  store.dispatch(
    changePokemonHp({ captureId: snapshot.pokemons[0].captureId, amount: 100 }),
  );
  assert.deepEqual(store.getState().party, reserved);
  passed.push(
    "reserve preserves the full current team and blocks reset, healing and bag changes",
  );
  assert.deepEqual(
    await reservePvpParty({
      battleId: "battle-1",
      userId: id,
      clientId: "client-owner",
    }),
    snapshot,
  );
  await clearAccountStore();
  await activateAccountStore(id);
  assert.equal(store.getState().party.pvpLock!.battleId, snapshot.battleId);
  assert.equal(getCurrentHp(store.getState().party.pokemons[0].pokemon), 17);
  passed.push(
    "logout/reload preserve a reservation and snapshot retries keep their identity",
  );
  await accountStorage.setItem("persist:root", encodeAccountParty(original));
  assert.equal(saved(id).pvpLock!.battleId, snapshot.battleId);
  store.dispatch({ type: PVP_PARTY_COMMIT, payload: original });
  store.dispatch(changeBagMoney({ amount: 1, direction: "add" }));
  assert.equal(store.getState().party.bag!.money, 77);
  await syncPvpSavedParty();
  assert.equal(store.getState().party.pvpLock!.battleId, snapshot.battleId);
  passed.push(
    "a stale tab cannot overwrite a disk reservation or mutate before syncing it",
  );
  const result: PvpResult = {
    battleId: snapshot.battleId,
    resultId: "result-1",
    userId: id,
    snapshotId: snapshot.snapshotId,
    baseHash: snapshot.baseHash,
    outcome: "lose",
    patches: snapshot.pokemons.map((capture) => ({
      captureId: capture.captureId,
      hp: 2,
      statuses: ["poisoned"],
      statusTurns: {},
    })),
  };
  await assert.rejects(
    applyPvpResult({ ...result, userId: other }),
    /otra cuenta/,
  );
  await assert.rejects(
    applyPvpResult({
      ...result,
      patches: [{ ...result.patches[0], captureId: "foreign" }],
    }),
    /capturas|válidos/,
  );
  assert.equal(getCurrentHp(store.getState().party.pokemons[0].pokemon), 17);
  testStorage.failWritesFor.add(accountStorageKey(id));
  await assert.rejects(applyPvpResult(result), /guardar/);
  assert.equal(saved(id).pvpReceipts?.length ?? 0, 0);
  assert.equal(getCurrentHp(saved(id).pokemons[0].pokemon), 17);
  testStorage.failWritesFor.clear();
  await applyPvpResult(result);
  const applied = clone(store.getState().party);
  assert.equal(getCurrentHp(applied.pokemons[0].pokemon), 2);
  assert.deepEqual(applied.pokemons[0].statuses, ["poisoned"]);
  assert.deepEqual(applied.bag, original.bag);
  assert.deepEqual(applied.pokemons[0].moves, original.pokemons[0].moves);
  assert.equal(applied.pvpLock!.phase, "saved");
  assert.equal(saved(id).pvpReceipts!.length, 1);
  passed.push(
    "result writes HP/primary conditions and receipt atomically; failures keep the original locked party",
  );
  await applyPvpResult(result);
  assert.deepEqual(store.getState().party, applied);
  await assert.rejects(
    applyPvpResult({ ...result, patches: [{ ...result.patches[0], hp: 3 }] }),
    /distinto/,
  );
  await releasePvpParty(snapshot.battleId, result.resultId);
  setPvpSyncBlocked(false);
  // This fixture represents a later, confirmed new game. Public reset dispatches
  // now require the server coordinator and cannot clear a party directly.
  await transactPvpParty(id, async (party) => ({
    party: partyReducer(party, resetGame()),
    value: undefined,
  }));
  await persistor.flush();
  await applyPvpResult(result);
  assert.equal(store.getState().party.pokemons.length, 0);
  assert.equal(store.getState().party.pvpReceipts!.length, 1);
  passed.push(
    "duplicate results never reapply, including after confirmed release and a new local game",
  );
  testStorage.seed(accountStorageKey(other), encodeAccountParty(fixture()));
  await activateAccountStore(other);
  await assert.rejects(applyPvpResult(result), /otra cuenta/);
  assert.equal(getCurrentHp(store.getState().party.pokemons[0].pokemon), 17);
  const foreign = { ...snapshot, battleId: "battle-conflict", userId: other };
  await assert.rejects(recoverPvpPartyLock(foreign), /no coincide/);
  assert.equal(store.getState().party.pvpLock!.phase, "held");
  assert.ok(store.getState().party.pvpLock!.conflict);
  assert.equal(getCurrentHp(saved(other).pokemons[0].pokemon), 17);
  passed.push(
    "a different account or divergent device cannot receive another team's result and remains safely locked",
  );
  for (const [owner, kind] of [
    [2003, "purchase"],
    [2004, "reset"],
  ] as const) {
    const locked = fixture();
    if (kind === "purchase")
      locked.shopLock = {
        userId: owner,
        clientId: "client-owner",
        requestId: "pending-purchase",
      };
    else
      locked.resetLock = {
        userId: owner,
        clientId: "client-owner",
        requestId: "pending-reset",
        expectedWalletRevision: 0,
      };
    testStorage.seed(accountStorageKey(owner), encodeAccountParty(locked));
    await activateAccountStore(owner);
    await assert.rejects(
      reservePvpParty({
        userId: owner,
        clientId: "client-owner",
        battleId: "blocked-battle",
      }),
      /compra|reinicio/,
    );
    assert.equal(saved(owner).pvpLock, undefined);
    assert.equal(saved(owner).pokemons.length, 1);
    assert.ok(
      kind === "purchase" ? saved(owner).shopLock : saved(owner).resetLock,
    );
  }
  passed.push(
    "pending purchases and new-game intents cannot submit a PvP snapshot or erase their existing lock",
  );
  return passed;
}
