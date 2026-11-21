import assert from "node:assert/strict";
import { test } from "node:test";
import { Battle } from "@pkmn/sim";
import reducer, { type PartyState } from "../src/slices/partySlice";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import {
  createLeveledPokemon,
  changeLevel,
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import {
  preparePartyItem,
  needsMaxRevive,
  prepareRareCandyParty,
} from "../src/lib/fullRestorePlan";
import { emptyBattleField } from "../src/lib/battleField";
import { runEmeraldAction } from "../src/lib/emerald/engine";
import {
  startTrainerBattle,
  chooseTrainerAction,
  cancelTrainerAction,
} from "../src/lib/trainerBattle/engine";
import {
  createTrainerBattleSession,
  validTrainerBattleSession,
} from "../src/lib/trainerBattle/model";
import { validLocalItemOutbox } from "../src/lib/shop/localItems";
import { validItemUse } from "../src/lib/shop/itemUse";
import { applyPvpTrainerCommand } from "../src/lib/pvp/battleAdapter";
import { pvpRequestKey } from "../src/lib/pvp/types";
import { CONSUMABLE_ITEM_IDS, USABLE_ITEM_IDS } from "../src/lib/shop/types";
import type { CapturedPokemon } from "../src/types/pokemon";
import type { EmeraldChoice } from "../src/lib/emerald/types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const seed: [number, number, number, number] = [1, 2, 3, 4];
function member(
  captureId: string,
  level = 20,
  moveIds = [150],
  speciesId = 143,
): CapturedPokemon {
  const species = trainerSpecies.find((entry) => entry.id === speciesId)!;
  return {
    captureId,
    pokemon: createLeveledPokemon(
      {
        id: species.id,
        name: species.name,
        image: null,
        types: [...species.types],
        stats: clone(species.baseStats),
      },
      undefined,
      level,
    ),
    moves: moveIds.map((id) => ({
      ...clone(trainerMoves.find((move) => move.id === id)!),
      currentPp: 3,
    })),
    statuses: [],
    statusTurns: {},
  };
}
function setHp(capture: CapturedPokemon, hp: number) {
  capture.pokemon.stats.find((stat) => stat.name === "hp")!.value = hp;
}
function party(inBattle = false, automatic = false): PartyState {
  const before = reducer(undefined, { type: "test/init" });
  const bench = member("bench");
  setHp(bench, 0);
  const foe = member("opponent");
  return {
    ...before,
    pokemons: [member("own"), bench],
    bag: { ...before.bag!, items: { "max-revive": 2, "rare-candy": 2 } },
    opponent: inBattle
      ? {
          kind: "wild",
          encounterId: "revive-candy-test",
          pokemon: foe.pokemon,
          moves: foe.moves,
          statuses: [],
          stages: neutralBattleStages(),
          automation: { enabled: automatic, catalogRevision: 0 },
        }
      : null,
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
function choose(
  state: PartyState,
  side: "player" | "opponent",
  choice: EmeraldChoice,
): PartyState {
  return {
    ...state,
    ...runEmeraldAction(
      state,
      state.battleField!.activeCaptureId!,
      side,
      choice,
      seed,
      `test-${side}-${state.emerald?.serial ?? 0}`,
    ),
  };
}
const move = { kind: "move", moveId: 150 } as const;

test("Max Revive outside battle restores only fainted HP, preserving PP, conditions, stages, level and Bag", async () => {
  const before = party();
  const target = before.pokemons[1];
  target.statuses = ["poisoned"];
  target.statusTurns = { asleep: 3 };
  target.pokemon.battleStages!.attack = -2;
  const original = clone(before);
  assert(needsMaxRevive(before, "bench"));
  assert.equal(needsMaxRevive(before, "own"), false);
  const after = await preparePartyItem(before, "bench", "max-revive");
  assert.deepEqual(before, original);
  const expected = clone(original);
  setHp(expected.pokemons[1], getMaxHp(target.pokemon)!);
  assert.deepEqual(after, expected);
  await assert.rejects(
    preparePartyItem(after, "bench", "max-revive"),
    /no tendr[ií]a efecto/,
  );
  await assert.rejects(
    preparePartyItem(before, "bench", "max-revive", 150),
    /movimiento/,
  );
});

test("native Max Revive uses one action, restores native living counts and lets the revived reserve switch in after JSON reload", () => {
  const before = party(true);
  const original = clone(before);
  const queued = choose(before, "player", {
    kind: "item",
    item: "max-revive",
    captureId: "bench",
  });
  assert.equal(
    getCurrentHp(queued.pokemons[1].pokemon),
    0,
    "selection does not heal before the native turn commits",
  );
  const after = choose(clone(queued), "opponent", move);
  assert.deepEqual(before, original);
  assert.equal(
    getCurrentHp(after.pokemons[1].pokemon),
    getMaxHp(after.pokemons[1].pokemon),
  );
  assert.equal(after.battleField!.turn, 2);
  assert.equal(
    after.pokemons[0].moves![0].currentPp,
    3,
    "using an item spends no move PP",
  );
  assert.equal(after.pokemons[1].moves![0].currentPp, 3);
  assert.equal(
    after.opponent!.moves![0].currentPp,
    2,
    "only one rival response occurs",
  );
  const native = Battle.fromJSON(after.emerald!.engine);
  const restored = native.p1.pokemon.find(
    (entry) => entry.set.name === "bench",
  )!;
  assert.equal(restored.fainted, false);
  assert.equal(restored.faintQueued, false);
  assert.equal(native.p1.pokemonLeft, 2);
  const switched = choose(
    choose(clone(after), "player", { kind: "switch", captureId: "bench" }),
    "opponent",
    move,
  );
  assert.equal(switched.battleField!.activeCaptureId, "bench");
  assert.equal(
    Battle.fromJSON(switched.emerald!.engine).p1.active[0].set.name,
    "bench",
  );
  assert.throws(
    () =>
      choose(after, "player", {
        kind: "item",
        item: "max-revive",
        captureId: "own",
      }),
    /no tendr[ií]a efecto/,
  );
});

test("new native encounters preserve an imported fainted reserve's primary status, stages and PP when Max Revive restores only HP", async () => {
  const before = party(true, true);
  before.pokemons[1].statuses = ["poisoned"];
  before.pokemons[1].pokemon.battleStages!.attack = -2;
  before.pokemons[1].moves![0].currentPp = 0;
  const original = clone(before);
  const queued = choose(before, "player", {
    kind: "item",
    item: "max-revive",
    captureId: "bench",
  });
  assert.equal(getCurrentHp(queued.pokemons[1].pokemon), 0);
  assert.deepEqual(
    queued.pokemons[1].statuses,
    ["poisoned"],
    "planning a native action cannot erase a KO reserve's saved primary condition",
  );
  const after = await preparePartyItem(before, "bench", "max-revive");
  assert.deepEqual(before, original);
  assert.equal(
    getCurrentHp(after.pokemons[1].pokemon),
    getMaxHp(after.pokemons[1].pokemon),
  );
  assert.deepEqual(after.pokemons[1].statuses, ["poisoned"]);
  assert.equal(after.pokemons[1].pokemon.battleStages!.attack, -2);
  assert.equal(after.pokemons[1].moves![0].currentPp, 0);
  const native = Battle.fromJSON(after.emerald!.engine);
  assert.equal(
    native.p1.pokemon.find((pokemon) => pokemon.set.name === "bench")!.status,
    "psn",
  );
  const switched = choose(
    choose(clone(after), "player", { kind: "switch", captureId: "bench" }),
    "opponent",
    move,
  );
  assert.equal(switched.battleField!.activeCaptureId, "bench");
  assert.deepEqual(switched.pokemons[1].statuses, ["poisoned"]);
  assert(
    getCurrentHp(switched.pokemons[1].pokemon) <
      getMaxHp(switched.pokemons[1].pokemon)!,
    "normal poison damage still applies after the revived Pokemon enters",
  );
});

test("automatic and manual local plans consume one turn and never restore PP or heal an already living target", async () => {
  const automatic = await preparePartyItem(
    party(true, true),
    "bench",
    "max-revive",
  );
  assert.equal(automatic.battleField!.turn, 2);
  assert.equal(
    getCurrentHp(automatic.pokemons[1].pokemon),
    getMaxHp(automatic.pokemons[1].pokemon),
  );
  assert.equal(automatic.opponent!.moves![0].currentPp, 2);
  assert.equal(automatic.pokemons[0].moves![0].currentPp, 3);
  const manual = party(true);
  manual.opponent!.kind = "trainer";
  const restored = await preparePartyItem(manual, "bench", "max-revive");
  assert.equal(restored.battleField!.playerItemUsedThisTurn, true);
  assert.equal(restored.battleField!.turn, 1);
  await assert.rejects(
    preparePartyItem(restored, "own", "max-elixir"),
    /acci[oó]n de este turno/,
  );
  await assert.rejects(
    preparePartyItem(restored, "own", "max-revive"),
    /no tendr[ií]a efecto/,
  );
});

test("Max Revive cannot replace the compulsory switch or the recharge of the acting Pokemon", async () => {
  const forced = party(true);
  const enemy = member("opponent", 100, [94], 65);
  forced.opponent!.pokemon = enemy.pokemon;
  forced.opponent!.moves = enemy.moves;
  setHp(forced.pokemons[0], 1);
  forced.pokemons.push(member("replacement"));
  const knockedOut = choose(choose(forced, "player", move), "opponent", {
    kind: "move",
    moveId: 94,
  });
  assert.equal(knockedOut.emerald!.requests.player.forceSwitch, true);
  assert.throws(
    () =>
      choose(knockedOut, "player", {
        kind: "item",
        item: "max-revive",
        captureId: "bench",
      }),
    /reemplazo obligatorio/,
  );
  const recharge = party(true);
  recharge.pokemons[0] = member("own", 50, [63]);
  recharge.opponent!.pokemon = member("opponent", 100).pokemon;
  const resting = choose(
    choose(recharge, "player", { kind: "move", moveId: 63 }),
    "opponent",
    move,
  );
  assert.equal(resting.emerald!.requests.player.locked, true);
  await assert.rejects(
    preparePartyItem(resting, "bench", "max-revive"),
    /forzado|recarga/,
  );
});

for (const side of ["a", "b"] as const)
  test(`admin ${side} Max Revive remains private/cancellable, records one authorized execution and revives a switchable reserve`, () => {
    const setup = createTrainerBattleSession();
    setup.teams.a = {
      name: "A",
      activeCaptureId: "a0",
      pokemons: [member("a0"), member("a1")],
    };
    setup.teams.b = {
      name: "B",
      activeCaptureId: "b0",
      pokemons: [member("b0"), member("b1")],
    };
    setHp(setup.teams[side].pokemons[1], 0);
    const started = startTrainerBattle(setup, seed);
    const choice = {
      kind: "item",
      item: "max-revive",
      captureId: `${side}1`,
    } as const;
    const queued = chooseTrainerAction(started, side, choice);
    assert.equal(getCurrentHp(queued.teams[side].pokemons[1].pokemon), 0);
    assert(validTrainerBattleSession(queued));
    const cancelled = cancelTrainerAction(clone(queued), side);
    assert.deepEqual(cancelled.teams, started.teams);
    const used: unknown[] = [];
    const other = side === "a" ? "b" : "a";
    const after = chooseTrainerAction(clone(queued), other, move, {
      onItemUsed: (...event) => used.push(event),
    });
    assert.deepEqual(used, [[side, `${side}1`, "max-revive", undefined]]);
    assert.equal(after.runtime!.turn, 2);
    assert.equal(
      getCurrentHp(after.teams[side].pokemons[1].pokemon),
      getMaxHp(after.teams[side].pokemons[1].pokemon),
    );
    assert.equal(after.teams[side].pokemons[0].moves![0].currentPp, 3);
    assert.equal(after.teams[side].pokemons[1].moves![0].currentPp, 3);
    const native = Battle.fromJSON(after.runtime!.engine);
    assert.equal((side === "a" ? native.p1 : native.p2).pokemonLeft, 2);
    assert(validTrainerBattleSession(after));
    const switching = chooseTrainerAction(clone(after), side, {
      kind: "switch",
      captureId: `${side}1`,
    });
    const switched = chooseTrainerAction(switching, other, move);
    assert.equal(switched.teams[side].activeCaptureId, `${side}1`);
  });

test("reviving then actually fainting the same reserve twice preserves two real KO reward events without inventing a KO on revival", () => {
  const setup = createTrainerBattleSession();
  const reserve = member("reserve", 5, [150], 35);
  setHp(reserve, 0);
  setup.teams.a = {
    name: "A",
    activeCaptureId: "active",
    pokemons: [member("active", 50), reserve],
  };
  setup.teams.b = {
    name: "B",
    activeCaptureId: "foe",
    pokemons: [member("foe", 50, [94, 150], 65)],
  };
  let session = startTrainerBattle(setup, seed);
  const resolve = (
    a: Parameters<typeof chooseTrainerAction>[2],
    b = move as Parameters<typeof chooseTrainerAction>[2],
  ) => {
    session = chooseTrainerAction(
      chooseTrainerAction(clone(session), "a", a),
      "b",
      b,
    );
  };
  resolve({ kind: "item", item: "max-revive", captureId: "reserve" });
  assert.equal(
    session.rewards,
    undefined,
    "a revival does not earn levels for either team",
  );
  resolve(
    { kind: "switch", captureId: "reserve" },
    { kind: "move", moveId: 94 },
  );
  assert.equal(session.rewards!.defeats.length, 1);
  assert.equal(session.runtime!.requests.a.forceSwitch, true);
  session = chooseTrainerAction(clone(session), "a", {
    kind: "switch",
    captureId: "active",
  });
  resolve({ kind: "item", item: "max-revive", captureId: "reserve" });
  assert.equal(session.rewards!.defeats.length, 1);
  resolve(
    { kind: "switch", captureId: "reserve" },
    { kind: "move", moveId: 94 },
  );
  assert.equal(session.rewards!.defeats.length, 2);
  assert.notEqual(
    session.rewards!.defeats[0].id,
    session.rewards!.defeats[1].id,
  );
  assert.equal(Battle.fromJSON(session.runtime!.engine).p1.pokemonLeft, 1);
});

test("network Max Revive requires inventory authorization just like the existing battle items", () => {
  const setup = createTrainerBattleSession();
  const reserve = member("a1");
  setHp(reserve, 0);
  setup.networkBattleId = "network-revive";
  setup.id = setup.networkBattleId;
  setup.teams.a = {
    name: "A",
    activeCaptureId: "a0",
    pokemons: [member("a0"), reserve],
  };
  setup.teams.b = {
    name: "B",
    activeCaptureId: "b0",
    pokemons: [member("b0")],
  };
  const started = startTrainerBattle(setup, seed);
  const item = { kind: "item", item: "max-revive", captureId: "a1" } as const;
  assert.throws(() => chooseTrainerAction(started, "a", item), /PvP/);
  const command = {
    commandId: "revive-authorized",
    userId: 2,
    side: "a" as const,
    requestKey: pvpRequestKey(started, "a"),
    choice: item,
    inventoryAuthorized: true as const,
  };
  assert.throws(
    () =>
      applyPvpTrainerCommand(started, {
        ...command,
        inventoryAuthorized: undefined,
      }),
    /Nest/,
  );
  const queued = applyPvpTrainerCommand(started, command);
  assert(validTrainerBattleSession(queued));
  assert.deepEqual(queued.networkItems!.used, []);
  const resolved = applyPvpTrainerCommand(clone(queued), {
    commandId: "revive-reply",
    userId: 3,
    side: "b",
    requestKey: pvpRequestKey(queued, "b"),
    choice: move,
  });
  assert.deepEqual(resolved.networkItems!.used, ["revive-authorized"]);
  assert.equal(
    getCurrentHp(resolved.teams.a.pokemons[1].pokemon),
    getMaxHp(resolved.teams.a.pokemons[1].pokemon),
  );
  assert.throws(
    () =>
      chooseTrainerAction(
        started,
        "a",
        { ...item, item: "rare-candy" } as unknown as Parameters<
          typeof chooseTrainerAction
        >[2],
        { allowNetworkItem: true },
      ),
    /no tendr[ií]a efecto/,
  );
});

test("Rare Candy raises exactly one level with existing stat/HP progression and preserves PP, conditions, inventory and source state", async () => {
  const before = party();
  before.pokemons[0].statuses = ["poisoned"];
  before.pokemons[0].pokemon.battleStages!.defense = -2;
  setHp(before.pokemons[0], 23);
  const original = clone(before);
  const after = await prepareRareCandyParty(before, "own");
  assert.deepEqual(before, original);
  assert.deepEqual(
    after.pokemons[0].pokemon,
    changeLevel(
      before.pokemons[0].pokemon as ReturnType<typeof createLeveledPokemon>,
      21,
    ),
  );
  assert.deepEqual(after.pokemons[0].moves, before.pokemons[0].moves);
  assert.deepEqual(after.pokemons[0].statuses, ["poisoned"]);
  assert.deepEqual(after.bag, before.bag);
  assert.deepEqual(after.pokemons[1], before.pokemons[1]);
  const revived = await prepareRareCandyParty(before, "bench");
  assert.equal(revived.pokemons[1].pokemon.level, 21);
  assert.equal(
    getCurrentHp(revived.pokemons[1].pokemon),
    0,
    "Rare Candy does not substitute for a revival item",
  );
});

test("Rare Candy rejects battle, reservations, missing targets and level 100 without touching the saved Party", async () => {
  const base = party();
  for (const state of [
    party(true),
    { ...base, pvpLock: {} },
    { ...base, shopLock: {} },
    { ...base, resetLock: {} },
    { ...base, itemUseLock: {} },
    { ...base, centerLock: {} },
    { ...base, captureAttempt: {} },
  ] as PartyState[]) {
    const original = clone(state);
    await assert.rejects(prepareRareCandyParty(state, "own"));
    assert.deepEqual(state, original);
  }
  const capped = party();
  capped.pokemons[0].pokemon = changeLevel(
    capped.pokemons[0].pokemon as ReturnType<typeof createLeveledPokemon>,
    100,
  );
  await assert.rejects(prepareRareCandyParty(capped, "own"), /nivel 100/);
  await assert.rejects(prepareRareCandyParty(base, "missing"), /v[aá]lido/);
  assert.deepEqual(
    (CONSUMABLE_ITEM_IDS as readonly string[]).includes("rare-candy"),
    false,
  );
  assert((USABLE_ITEM_IDS as readonly string[]).includes("rare-candy"));
});

test("Rare Candy debit intents and legacy-use receipts only accept outside-battle context, while Max Revive accepts battle", () => {
  const operation = {
    operationId: "item-test",
    captureId: "own",
    sequence: 1,
    quantity: 1,
    itemId: "rare-candy",
    context: "party",
  };
  const outbox = {
    version: 1,
    clientId: "test-client",
    nextSequence: 2,
    operations: [operation],
  };
  assert(validLocalItemOutbox(outbox));
  assert.equal(
    validLocalItemOutbox({
      ...outbox,
      operations: [{ ...operation, context: "local-battle" }],
    }),
    false,
  );
  assert(
    validLocalItemOutbox({
      ...outbox,
      operations: [
        { ...operation, itemId: "max-revive", context: "local-battle" },
      ],
    }),
  );
  const receipt = {
    requestId: "test-use",
    clientId: "test-client",
    captureId: "own",
    userId: 2,
    itemId: "rare-candy",
    context: "party",
    planHash: "a".repeat(64),
    expectedWalletRevision: 0,
    walletRevision: 1,
    status: "pending",
  };
  assert(validItemUse(receipt));
  assert.equal(validItemUse({ ...receipt, context: "local-battle" }), false);
  assert(
    validItemUse({ ...receipt, itemId: "max-revive", context: "local-battle" }),
  );
});
