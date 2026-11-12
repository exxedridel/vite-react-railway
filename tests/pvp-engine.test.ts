import assert from "node:assert/strict";
import { test } from "node:test";
import { Battle } from "@pkmn/sim";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import {
  chooseTrainerAction,
  forfeitTrainerBattle,
  startTrainerBattle,
} from "../src/lib/trainerBattle/engine";
import {
  trainerSetupErrors,
  validTrainerBattleSession,
} from "../src/lib/trainerBattle/model";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
} from "../src/lib/pokemonStats";
import {
  applyPvpTrainerCommand,
  applyPvpTrainerCommands,
  clearPvpCheckpointOutbox,
  createPvpTrainerSession,
  pvpTeamPatches,
  readPvpCheckpointOutbox,
  writePvpCheckpointOutbox,
} from "../src/lib/pvp/battleAdapter";
import {
  pvpRequestKey,
  type PvpBattleView,
  type PvpSnapshot,
} from "../src/lib/pvp/types";
import { GAME_DATA_VERSION } from "../src/lib/gameVersion";
import { buildNpcTrainerTeam } from "../src/lib/trainerBattle/kantoPresets";
import { chooseNpcTrainerAction } from "../src/lib/trainerBattle/npcAi";
import { readEmeraldRequest } from "../src/lib/emerald/engine";
import { pvpPlayersOnline } from "../src/lib/pvp/types";
import type { CapturedPokemon } from "../src/types/pokemon";

const seed: [number, number, number, number] = [1, 2, 3, 4];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function member(
  captureId: string,
  multiplier: number,
  hp: number,
  modern = false,
): CapturedPokemon {
  const species = trainerSpecies.find((value) => value.id === 35)!;
  const bases = clone(species.baseStats);
  if (modern) bases.find((stat) => stat.name === "special-attack")!.value += 15;
  const pokemon = createLeveledPokemon(
    {
      id: 35,
      name: "clefairy",
      image: null,
      types: modern ? ["fairy"] : [...species.types],
      stats: clone(bases),
    },
    bases,
    50,
    multiplier,
  );
  pokemon.stats.find((stat) => stat.name === "hp")!.value = hp;
  if (modern) pokemon.stats.find((stat) => stat.name === "attack")!.value += 7;
  return {
    captureId,
    pokemon,
    moves: [clone(trainerMoves.find((move) => move.id === 150)!)],
    statuses: ["poisoned"],
    statusTurns: {},
  };
}

function view(): PvpBattleView {
  const snapshot = (side: "a" | "b"): PvpSnapshot => ({
    version: 1,
    battleId: "pvp-test",
    snapshotId: `snapshot-${side}`,
    userId: side === "a" ? 1 : 2,
    clientId: `player-${side}`,
    dataVersion: GAME_DATA_VERSION,
    baseHash: side.repeat(64),
    pokemons: [
      member(
        "same-capture-id",
        side === "a" ? 1 : 2,
        side === "a" ? 17 : 29,
        side === "a",
      ),
      member(`reserve-${side}`, side === "a" ? 1.1 : 1.9, 0),
    ],
    activeCaptureId: "same-capture-id",
    hpMultiplier: side === "a" ? 1 : 2,
  });
  const a = snapshot("a"),
    b = snapshot("b");
  return {
    battleId: "pvp-test",
    phase: "ready",
    revision: 3,
    checkpointRevision: 0,
    host: { userId: 99, clientId: "admin-tab", epoch: 1, online: true },
    players: {
      a: {
        user: {
          id: 1,
          email: "a@example.test",
          first_name: "A",
          last_name: "Player",
          role: "player",
        },
        clientId: a.clientId,
        online: true,
        snapshot: a,
      },
      b: {
        user: {
          id: 2,
          email: "b@example.test",
          first_name: "B",
          last_name: "Player",
          role: "player",
        },
        clientId: b.clientId,
        online: true,
        snapshot: b,
      },
    },
    applied: { a: false, b: false },
    commands: [],
    session: null,
  };
}

test("PvP imports distinct HP multipliers, current stats/types and cross-player capture IDs without healing or mutating snapshots", () => {
  const state = view(),
    original = clone(state);
  const session = createPvpTrainerSession(state);
  assert(validTrainerBattleSession(session));
  assert.deepEqual(trainerSetupErrors(session), []);
  const started = startTrainerBattle(session, seed);
  assert(validTrainerBattleSession(started));
  assert.deepEqual(state, original);
  assert.equal(getCurrentHp(started.teams.a.pokemons[0].pokemon), 17);
  assert.equal(getCurrentHp(started.teams.b.pokemons[0].pokemon), 29);
  assert.equal(getCurrentHp(started.teams.a.pokemons[1].pokemon), 0);
  assert.equal(
    started.teams.a.pokemons[0].captureId,
    started.teams.b.pokemons[0].captureId,
  );
  const sim = Battle.fromJSON(started.runtime!.engine);
  assert.equal(
    sim.p1.active[0].maxhp,
    getMaxHp(state.players.a.snapshot!.pokemons[0].pokemon),
  );
  assert.equal(
    sim.p2.active[0].maxhp,
    getMaxHp(state.players.b!.snapshot!.pokemons[0].pokemon),
  );
  assert.equal(
    sim.p1.active[0].storedStats.atk,
    session.teams.a.pokemons[0].pokemon.stats.find(
      (stat) => stat.name === "attack",
    )!.value,
  );
  assert.deepEqual(sim.p1.active[0].types, ["Fairy"]);
  assert.equal(sim.p1.active[0].status, "psn");
  assert.equal(sim.p2.pokemon[1].fainted, true);
});

test("manual trainer validation remains strict; PvP still rejects duplicate IDs in one party, impossible HP and invalid moves", () => {
  const source = createPvpTrainerSession(view());
  const manual = clone(source);
  delete manual.networkBattleId;
  assert.equal(validTrainerBattleSession(manual), false);
  const duplicate = clone(source);
  duplicate.teams.a.pokemons[1].captureId =
    duplicate.teams.a.pokemons[0].captureId;
  assert.equal(validTrainerBattleSession(duplicate), false);
  const hp = clone(source);
  hp.teams.a.pokemons[0].pokemon.stats[0].value =
    getMaxHp(hp.teams.a.pokemons[0].pokemon)! + 1;
  assert.equal(validTrainerBattleSession(hp), false);
  const wrongMove = clone(source);
  wrongMove.teams.a.pokemons[0].moves![0].id = 9999;
  assert.equal(validTrainerBattleSession(wrongMove), false);
  const wrongOwner = view();
  wrongOwner.players.a.snapshot!.userId = 2;
  assert.throws(() => createPvpTrainerSession(wrongOwner), /propietario/);
});

test("forfeit resolves a winner without running queued attacks, consuming PP or healing HP and primary statuses", () => {
  const started = startTrainerBattle(createPvpTrainerSession(view()), seed);
  const pending = chooseTrainerAction(started, "b", {
    kind: "move",
    moveId: 150,
  });
  const before = Battle.fromJSON(pending.runtime!.engine);
  const finished = forfeitTrainerBattle(pending, "a");
  const after = Battle.fromJSON(finished.runtime!.engine);
  assert.equal(finished.phase, "finished");
  assert.equal(finished.runtime!.winner, "b");
  assert.equal(finished.runtime!.turn, pending.runtime!.turn);
  assert.deepEqual(finished.runtime!.pending, {});
  assert.equal(
    after.p1.active[0].moveSlots[0].pp,
    before.p1.active[0].moveSlots[0].pp,
  );
  assert.equal(
    after.p2.active[0].moveSlots[0].pp,
    before.p2.active[0].moveSlots[0].pp,
  );
  assert.equal(getCurrentHp(finished.teams.a.pokemons[0].pokemon), 17);
  assert.deepEqual(finished.teams.a.pokemons[0].statuses, ["poisoned"]);
  assert.equal(getCurrentHp(finished.teams.a.pokemons[1].pokemon), 0);
  assert(validTrainerBattleSession(finished));
  assert.match(finished.history[0].events[0], /se rindió/);
  assert.throws(() => forfeitTrainerBattle(pending, "b"), /rendición/);
  assert.throws(
    () => chooseTrainerAction(finished, "a", { kind: "move", moveId: 150 }),
    /activo/,
  );
  const patches = pvpTeamPatches(finished, "a");
  assert.equal(patches.length, 2);
  assert.deepEqual(Object.keys(patches[0]).sort(), [
    "captureId",
    "hp",
    "movesPp",
    "statusTurns",
    "statuses",
  ]);
  assert.equal(patches[0].hp, 17);
  assert.equal(patches[1].hp, 0);
  assert.deepEqual(patches[0].movesPp, [{ moveId: 150, currentPp: 40 }]);
});

test("PvP commands preserve native serialized state/PRNG, own request identity and persistent PP", () => {
  const setup = createPvpTrainerSession(view());
  for (const team of Object.values(setup.teams))
    for (const capture of team.pokemons) capture.statuses = [];
  const started = startTrainerBattle(setup, seed);
  const first = {
    commandId: "cmd-a",
    userId: 99,
    side: "a" as const,
    requestKey: pvpRequestKey(started, "a"),
    choice: { kind: "move" as const, moveId: 150 },
  };
  const second = {
    commandId: "cmd-b",
    userId: 99,
    side: "b" as const,
    requestKey: pvpRequestKey(started, "b"),
    choice: { kind: "move" as const, moveId: 150 },
  };
  const pending = applyPvpTrainerCommand(started, first);
  const resumed = applyPvpTrainerCommand(clone(pending), second);
  assert.deepEqual(resumed, applyPvpTrainerCommand(pending, second));
  assert.equal(resumed.runtime!.turn, 2);
  assert.equal(
    resumed.runtime!.requests.a.moves[0].pp,
    started.runtime!.requests.a.moves[0].pp - 1,
  );
  assert.equal(
    resumed.teams.a.pokemons[0].moves![0].pp,
    started.teams.a.pokemons[0].moves![0].pp,
  );
  assert.throws(() => applyPvpTrainerCommand(pending, first), /anterior/);
  assert.throws(
    () =>
      chooseTrainerAction(started, "a", {
        kind: "item",
        item: "full-restore",
        captureId: "same-capture-id",
      }),
    /objetos/,
  );
  assert.throws(() => pvpTeamPatches(started, "a"), /terminar/);
});

test("one checkpoint consumes double forfeits and commands made stale by earlier turn resolution without deadlocking", () => {
  const setup = createPvpTrainerSession(view());
  for (const team of Object.values(setup.teams))
    for (const capture of team.pokemons) capture.statuses = [];
  const session = startTrainerBattle(setup, seed);
  const command = (
    id: string,
    side: "a" | "b",
    choice: { kind: "forfeit" } | { kind: "move"; moveId: number },
  ) => ({
    commandId: id,
    userId: 99,
    side,
    requestKey: pvpRequestKey(session, side),
    choice,
  });
  const ended = applyPvpTrainerCommands(session, [
    command("forfeit-a", "a", { kind: "forfeit" }),
    command("forfeit-b", "b", { kind: "forfeit" }),
  ]);
  assert.equal(ended.session.phase, "finished");
  assert.equal(ended.session.runtime!.winner, "b");
  assert.deepEqual(ended.processedCommandIds, ["forfeit-a", "forfeit-b"]);
  assert.equal(ended.session.runtime!.serial, session.runtime!.serial + 1);
  const resolved = applyPvpTrainerCommands(session, [
    command("a-move", "a", { kind: "move", moveId: 150 }),
    command("b-move", "b", { kind: "move", moveId: 150 }),
    command("old-a-request", "a", { kind: "move", moveId: 150 }),
  ]);
  assert.equal(resolved.session.runtime!.turn, 2);
  assert.deepEqual(resolved.session.runtime!.pending, {});
  assert.deepEqual(resolved.processedCommandIds, [
    "a-move",
    "b-move",
    "old-a-request",
  ]);
  assert.throws(() =>
    applyPvpTrainerCommands(session, [
      command("invalid-current", "a", { kind: "move", moveId: 9999 }),
    ]),
  );
});

test("checkpoint proposals are durable and scoped to battle/admin/tab; failures do not pretend a transition was saved", () => {
  const session = startTrainerBattle(createPvpTrainerSession(view()), seed);
  const entry = {
    version: 1 as const,
    battleId: session.id,
    adminUserId: 99,
    clientId: "admin-tab",
    hostEpoch: 1,
    expectedCheckpointRevision: 0,
    session,
    processedCommandIds: ["command-1"],
  };
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  writePvpCheckpointOutbox(storage, entry);
  assert.deepEqual(
    readPvpCheckpointOutbox(storage, session.id, 99, "admin-tab"),
    clone(entry),
  );
  assert.equal(
    readPvpCheckpointOutbox(storage, session.id, 99, "another-tab"),
    null,
  );
  assert.equal(
    readPvpCheckpointOutbox(storage, session.id, 100, "admin-tab"),
    null,
  );
  assert.throws(
    () =>
      writePvpCheckpointOutbox(
        {
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        },
        entry,
      ),
    /QuotaExceeded/,
  );
  assert.throws(
    () =>
      writePvpCheckpointOutbox(storage, {
        ...entry,
        session: { ...session, networkBattleId: "another-battle" },
      }),
    /guardado/,
  );
  assert.equal(data.size, 1);
  clearPvpCheckpointOutbox(storage, session.id, 99, "admin-tab");
  assert.equal(data.size, 0);
});

function trainerView(): PvpBattleView {
  const state = view();
  state.mode = "trainer";
  delete state.players.b;
  state.trainer = {
    presetId: "kanto-brock",
    region: "kanto",
    name: "Brock",
    team: buildNpcTrainerTeam(
      "kanto-brock",
      state.players.a.snapshot!.hpMultiplier,
    ),
  };
  state.applied.b = true;
  return state;
}

test("Trainer Battle imports only the real owner snapshot and the confirmed NPC preset without changing either", () => {
  const state = trainerView(),
    original = clone(state);
  assert.equal(pvpPlayersOnline(state), true);
  const setup = createPvpTrainerSession(state);
  assert.deepEqual(setup.teams.a.pokemons, state.players.a.snapshot!.pokemons);
  assert.deepEqual(setup.teams.b, state.trainer!.team);
  assert.deepEqual(state, original);
  const started = startTrainerBattle(setup, seed);
  assert(validTrainerBattleSession(started));
  assert.equal(getCurrentHp(started.teams.a.pokemons[0].pokemon), 17);
  assert.equal(started.teams.b.pokemons[0].pokemon.level, 12);
  assert.equal(
    getCurrentHp(started.teams.b.pokemons[0].pokemon),
    getMaxHp(started.teams.b.pokemons[0].pokemon),
  );
  const restored = clone(started);
  const choice = chooseNpcTrainerAction(restored)!;
  assert.equal(choice.kind, "move");
  const afterNpc = chooseTrainerAction(restored, "b", choice);
  const ended = forfeitTrainerBattle(afterNpc, "a");
  assert.equal(ended.runtime!.winner, "b");
  assert.equal(
    pvpTeamPatches(ended, "a").length,
    state.players.a.snapshot!.pokemons.length,
  );
  state.players.a.online = false;
  assert.equal(pvpPlayersOnline(state), false);
  const missingPreset = trainerView();
  delete missingPreset.trainer!.team;
  assert.throws(() => createPvpTrainerSession(missingPreset), /Trainer/);
});

test("NPC decisions ignore the player's pending action, respect disabled moves and preserve the checkpoint", () => {
  const started = startTrainerBattle(
    createPvpTrainerSession(trainerView()),
    seed,
  );
  const before = structuredClone(started);
  const choice = chooseNpcTrainerAction(started)!;
  assert.deepEqual(started, before);
  const anotherChoice = clone(started);
  anotherChoice.runtime!.pending.a = {
    kind: "switch",
    captureId: "does-not-matter",
  };
  assert.deepEqual(chooseNpcTrainerAction(anotherChoice), choice);
  const blocked = clone(started);
  const selected = blocked.runtime!.requests.b.moves.find(
    (move) => choice.kind === "move" && move.id === choice.moveId,
  )!;
  selected.disabled = true;
  const alternative = chooseNpcTrainerAction(blocked)!;
  assert.equal(alternative.kind, "move");
  if (alternative.kind === "move")
    assert.notEqual(alternative.moveId, selected.id);
  blocked.runtime!.pending.b = alternative;
  assert.equal(chooseNpcTrainerAction(blocked), null);
  blocked.runtime!.pending = {};
  blocked.runtime!.requests.b.waiting = true;
  assert.equal(chooseNpcTrainerAction(blocked), null);
});

test("NPC forced replacement uses a living reserve and cannot invent moves when no legal request exists", () => {
  const started = startTrainerBattle(
    createPvpTrainerSession(trainerView()),
    seed,
  );
  const request = started.runtime!.requests.b;
  request.forceSwitch = true;
  request.trapped = true;
  started.teams.b.pokemons[0].pokemon.stats.find(
    (stat) => stat.name === "hp",
  )!.value = 0;
  assert.deepEqual(chooseNpcTrainerAction(started), {
    kind: "switch",
    captureId: started.teams.b.pokemons[1].captureId,
  });
  started.teams.b.pokemons[1].pokemon.stats.find(
    (stat) => stat.name === "hp",
  )!.value = 0;
  assert.equal(chooseNpcTrainerAction(started), null);
  request.forceSwitch = false;
  request.moves = [];
  assert.equal(chooseNpcTrainerAction(started), null);
});

test("NPC uses native Struggle when PP are exhausted instead of waiting or inventing a normal move", () => {
  const started = startTrainerBattle(createPvpTrainerSession(view()), seed);
  const native = Battle.fromJSON(started.runtime!.engine);
  for (const move of native.p2.active[0].moveSlots) move.pp = 0;
  native.makeRequest("move");
  started.runtime!.engine = JSON.stringify(native.toJSON());
  started.runtime!.requests.b = readEmeraldRequest(native.p2);
  const choice = chooseNpcTrainerAction(started);
  assert.deepEqual(choice, { kind: "move", moveId: 165 });
  const pending = chooseTrainerAction(started, "b", choice!);
  assert.deepEqual(pending.runtime!.pending.b, choice);
});

test("NPC completes native Hyper Beam recharge using the forced zero-PP move", () => {
  const setup = createPvpTrainerSession(view());
  for (const side of ["a", "b"] as const) {
    const capture = setup.teams[side].pokemons[0];
    capture.statuses = [];
    capture.pokemon.stats.find((stat) => stat.name === "hp")!.value = getMaxHp(
      capture.pokemon,
    )!;
  }
  setup.teams.b.pokemons[0].pokemon.stats.find(
    (stat) => stat.name === "attack",
  )!.value = 10;
  setup.teams.b.pokemons[0].moves = [
    clone(trainerMoves.find((move) => move.id === 63)!),
  ];
  let session = startTrainerBattle(setup, seed);
  session = chooseTrainerAction(session, "a", { kind: "move", moveId: 150 });
  session = chooseTrainerAction(session, "b", { kind: "move", moveId: 63 });
  assert.equal(session.runtime!.requests.b.locked, true);
  const choice = chooseNpcTrainerAction(session);
  assert.deepEqual(choice, { kind: "move", moveId: 0 });
  assert.doesNotThrow(() => chooseTrainerAction(session, "b", choice!));
});
test("authorized Full Restore is reserved until native execution; cancelled and forfeited choices do not consume stock", () => {
  const started = startTrainerBattle(createPvpTrainerSession(view()), seed);
  const item = {
    commandId: "item-a",
    userId: 99,
    side: "a" as const,
    requestKey: pvpRequestKey(started, "a"),
    inventoryAuthorized: true as const,
    choice: {
      kind: "item" as const,
      item: "full-restore" as const,
      captureId: "same-capture-id",
    },
  };
  assert.throws(
    () =>
      applyPvpTrainerCommand(started, {
        ...item,
        inventoryAuthorized: undefined,
      }),
    /Nest/,
  );
  const queued = applyPvpTrainerCommand(started, item);
  assert.deepEqual(queued.networkItems!.used, []);
  assert.equal(queued.networkItems!.pending.a!.commandId, "item-a");
  assert.equal(getCurrentHp(queued.teams.a.pokemons[0].pokemon), 17);
  const cancelled = applyPvpTrainerCommand(queued, {
    commandId: "cancel",
    userId: 99,
    side: "a",
    requestKey: pvpRequestKey(queued, "a"),
    choice: { kind: "cancel" },
  });
  assert.deepEqual(cancelled.networkItems, { pending: {}, used: [] });
  const forfeited = applyPvpTrainerCommand(queued, {
    commandId: "forfeit",
    userId: 99,
    side: "b",
    requestKey: pvpRequestKey(queued, "b"),
    choice: { kind: "forfeit" },
  });
  assert.deepEqual(forfeited.networkItems, { pending: {}, used: [] });
  const done = applyPvpTrainerCommand(clone(queued), {
    commandId: "resolve",
    userId: 99,
    side: "b",
    requestKey: pvpRequestKey(queued, "b"),
    choice: { kind: "move", moveId: 150 },
  });
  assert.deepEqual(done.networkItems!.used, ["item-a"]);
  assert.deepEqual(done.networkItems!.pending, {});
  assert.equal(
    getCurrentHp(done.teams.a.pokemons[0].pokemon),
    getMaxHp(done.teams.a.pokemons[0].pokemon),
  );
  assert.deepEqual(
    Battle.fromJSON(done.runtime!.engine).p1.pokemon[0].moveSlots.map(
      (m) => m.pp,
    ),
    Battle.fromJSON(started.runtime!.engine).p1.pokemon[0].moveSlots.map(
      (m) => m.pp,
    ),
  );
  assert.ok(validTrainerBattleSession(done));
});

for (const item of ["max-ether", "max-elixir"] as const) {
  test(`${item}: an authorized native effect consumes the selected item and exports exact learned PP`, () => {
    const state = view();
    const capture = state.players.a.snapshot!.pokemons[0];
    for (const player of Object.values(state.players)) {
      if (!player) continue;
      const active = player.snapshot!.pokemons[0];
      active.statuses = [];
      active.pokemon.stats.find((stat) => stat.name === "hp")!.value = getMaxHp(
        active.pokemon,
      )!;
    }
    capture.moves = [
      { ...clone(trainerMoves.find((m) => m.id === 150)!), currentPp: 0 },
      { ...clone(trainerMoves.find((m) => m.id === 45)!), currentPp: 1 },
    ];
    const started = startTrainerBattle(createPvpTrainerSession(state), seed);
    const queued = applyPvpTrainerCommand(started, {
      commandId: `pp-${item}`,
      userId: 99,
      side: "a",
      requestKey: pvpRequestKey(started, "a"),
      inventoryAuthorized: true,
      choice: {
        kind: "item",
        item,
        captureId: capture.captureId,
        ...(item === "max-ether" ? { moveId: 150 } : {}),
      },
    });
    assert.equal(queued.teams.a.pokemons[0].moves![0].currentPp, 0);
    assert.deepEqual(queued.networkItems!.used, []);
    assert.equal(queued.networkItems!.pending.a!.itemId, item);
    const resumed = JSON.parse(JSON.stringify(queued));
    const done = applyPvpTrainerCommand(resumed, {
      commandId: "resolve-pp",
      userId: 99,
      side: "b",
      requestKey: pvpRequestKey(resumed, "b"),
      choice: { kind: "move", moveId: 150 },
    });
    const moves = done.teams.a.pokemons[0].moves!;
    assert.equal(moves[0].currentPp, moves[0].pp);
    assert.equal(moves[1].currentPp, item === "max-ether" ? 1 : moves[1].pp);
    assert.deepEqual(done.networkItems!.used, [`pp-${item}`]);
    assert.deepEqual(done.networkItems!.pending, {});
    const finished = forfeitTrainerBattle(done, "b");
    assert.deepEqual(
      pvpTeamPatches(finished, "a")[0].movesPp,
      moves.map((m) => ({ moveId: m.id, currentPp: m.currentPp })),
    );
    assert.equal(
      capture.moves[0].currentPp,
      0,
      "original snapshot remains immutable",
    );
  });
}
