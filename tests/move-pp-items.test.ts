import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, { type PartyState } from "../src/slices/partySlice";
import { trainerSpecies, trainerMoves } from "../src/lib/trainerBattle/catalog";
import {
  createLeveledPokemon,
  getCurrentHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { emptyBattleField } from "../src/lib/battleField";
import {
  runEmeraldAction,
  cancelEmeraldChoice,
  refreshEmeraldState,
  restoreEmeraldBattle,
} from "../src/lib/emerald/engine";
import {
  startTrainerBattle,
  chooseTrainerAction,
} from "../src/lib/trainerBattle/engine";
import {
  createTrainerBattleSession,
  validTrainerBattleSession,
} from "../src/lib/trainerBattle/model";
import { preparePartyItem } from "../src/lib/fullRestorePlan";
import {
  getCurrentMovePp,
  getMaxMovePp,
  hydratePartyMovePp,
  normalizeMovePp,
} from "../src/lib/movePp";
import type { EmeraldChoice } from "../src/lib/emerald/types";
import type { TrainerPokemon } from "../src/lib/trainerBattle/types";

const seed: [number, number, number, number] = [1, 2, 3, 4];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function member(
  id: string,
  ids = [33, 150],
  currentPp?: number,
): TrainerPokemon {
  const species = trainerSpecies.find((entry) => entry.id === 143)!;
  return {
    captureId: id,
    pokemon: createLeveledPokemon(
      {
        id: species.id,
        name: species.name,
        image: null,
        types: [...species.types],
        stats: clone(species.baseStats),
      },
      undefined,
      50,
    ),
    moves: ids.map((moveId) => ({
      ...clone(trainerMoves.find((move) => move.id === moveId)!),
      ...(currentPp !== undefined ? { currentPp } : {}),
    })),
    statuses: [],
    statusTurns: {},
  };
}
function wild(ids = [33, 150], pp?: number): PartyState {
  const own = member("own", ids, pp),
    foe = member("foe", [150]);
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: [own, member("bench", [33, 150], 0)],
    opponent: {
      pokemon: foe.pokemon,
      moves: foe.moves,
      kind: "wild",
      encounterId: "pp-test",
      statuses: [],
      stages: neutralBattleStages(),
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
function choose(
  state: PartyState,
  side: "player" | "opponent",
  choice: number | EmeraldChoice,
): PartyState {
  return {
    ...state,
    ...runEmeraldAction(
      state,
      state.battleField!.activeCaptureId!,
      side,
      typeof choice === "number" ? { kind: "move", moveId: choice } : choice,
      seed,
      `${state.emerald?.serial ?? 0}-${side}`,
    ),
  };
}
function turn(
  state: PartyState,
  own: number | EmeraldChoice,
  foe = 150,
): PartyState {
  return choose(choose(state, "player", own), "opponent", foe);
}
function pp(state: PartyState, id: number, capture = 0): number {
  return getCurrentMovePp(
    state.pokemons[capture].moves!.find((move) => move.id === id)!,
  );
}
function trainer() {
  const setup = createTrainerBattleSession();
  setup.teams.a = {
    name: "Ana",
    pokemons: [member("own", [33, 150], 0), member("bench", [33], 0)],
    activeCaptureId: "own",
  };
  setup.teams.b = {
    name: "NPC",
    pokemons: [member("foe", [150], 3)],
    activeCaptureId: "foe",
  };
  return setup;
}

test("PP helpers initialize missing only, preserve zero, clamp invalid and use Gen III fallback", () => {
  const move = member("a", [33]).moves![0];
  assert.equal(getCurrentMovePp(move), 35);
  assert.equal(getCurrentMovePp({ ...move, currentPp: 0 }), 0);
  assert.equal(getCurrentMovePp({ ...move, currentPp: NaN }), 0);
  assert.equal(getCurrentMovePp({ ...move, currentPp: 99 }), 35);
  assert.equal(getMaxMovePp({ ...move, pp: null }), 35);
  assert.equal(normalizeMovePp(move).currentPp, 35);
});

test("wild PP are spent only at execution and persist across JSON and a new encounter; all zero offers Struggle", () => {
  const queued = choose(wild([33], 1), "player", 33);
  assert.equal(pp(queued, 33), 1);
  const done = choose(clone(queued), "opponent", 150);
  assert.equal(pp(done, 33), 0);
  assert.equal(done.pokemons[0].moves![0].pp, 35);
  assert.throws(() => choose(done, "player", 33), /disponible/);
  const next = clone(done);
  delete next.emerald;
  next.opponent!.encounterId = "next";
  const struggle = choose(next, "player", 165);
  assert.equal(struggle.emerald!.requests.player.moves[0].id, 165);
  const resolved = choose(clone(struggle), "opponent", 150);
  assert.equal(pp(resolved, 33), 0);
  assert(
    getCurrentHp(resolved.pokemons[0].pokemon) <
      getCurrentHp(next.pokemons[0].pokemon),
  );
});

test("Fly continuation and Hyper Beam recharge do not spend additional PP", () => {
  let fly = turn(wild([19], 1), 19);
  assert.equal(pp(fly, 19), 0);
  fly = choose(clone(fly), "opponent", 150);
  assert.equal(pp(fly, 19), 0);
  assert(!fly.emerald!.requests.player.locked);
  let beam = turn(wild([63], 1), 63);
  assert.equal(pp(beam, 63), 0);
  beam = choose(clone(beam), "opponent", 150);
  assert.equal(pp(beam, 63), 0);
});

test("metadata/HP refresh and migration recover spent legacy native PP without replenishing", () => {
  const state = turn(wild([150], 2), 150);
  const legacy = clone(state);
  for (const move of legacy.pokemons[0].moves!) delete move.currentPp;
  assert.equal(pp(hydratePartyMovePp(legacy), 150), 1);
  const mirror = JSON.parse(legacy.emerald!.mirror);
  for (const move of mirror[0][0].moves) delete move.currentPp;
  legacy.emerald!.mirror = JSON.stringify(mirror);
  legacy.pokemons[0].pokemon.stats[0].value -= 1;
  const refreshed = { ...legacy, ...refreshEmeraldState(legacy) };
  const resumed = turn(refreshed, 150);
  assert.equal(pp(resumed, 150), 0);
  const broken = clone(legacy);
  broken.emerald!.engine = "broken";
  assert.equal(
    hydratePartyMovePp(broken).pokemons[0].moves![0].currentPp,
    undefined,
  );
});

test("Max Ether and Elixir work on KO reserves outside battle without altering HP or unrelated PP", async () => {
  const state = wild([33, 150], 0);
  state.opponent = null;
  state.pokemons[1].pokemon.stats[0].value = 0;
  const ether = await preparePartyItem(state, "bench", "max-ether", 33);
  assert.equal(pp(ether, 33, 1), 35);
  assert.equal(pp(ether, 150, 1), 0);
  assert.equal(getCurrentHp(ether.pokemons[1].pokemon), 0);
  assert.equal(pp(ether, 33), 0);
  await assert.rejects(
    preparePartyItem(ether, "bench", "max-ether", 33),
    /efecto/,
  );
  await assert.rejects(
    preparePartyItem(state, "bench", "max-ether", 999),
    /válido/,
  );
  const elixir = await preparePartyItem(ether, "bench", "max-elixir");
  assert.equal(pp(elixir, 33, 1), 35);
  assert.equal(pp(elixir, 150, 1), 40);
  assert.equal(getCurrentHp(elixir.pokemons[1].pokemon), 0);
});

test("legacy PP item consumes one turn action and refuses no-effect without changing state", async () => {
  const state = wild([33, 150], 0);
  state.opponent!.kind = "trainer";
  const before = JSON.stringify(state);
  const restored = await preparePartyItem(state, "own", "max-ether", 33);
  assert.equal(JSON.stringify(state), before);
  assert(restored.battleField!.playerItemUsedThisTurn);
  assert.equal(pp(restored, 33), 35);
  assert.equal(pp(restored, 150), 0);
  await assert.rejects(
    preparePartyItem(restored, "own", "max-elixir"),
    /acción/,
  );
});

test("wild PP items queue a durable turn action, restore only their target, and cannot be cancelled", async () => {
  const state = wild([33, 150], 0);
  const queued = await preparePartyItem(state, "bench", "max-ether", 33);
  assert.equal(pp(queued, 33, 1), 0);
  assert.throws(
    () => cancelEmeraldChoice(queued, "player"),
    /objeto|Full Restore/i,
  );
  const done = choose(clone(queued), "opponent", 150);
  assert.equal(pp(done, 33, 1), 35);
  assert.equal(pp(done, 150, 1), 0);
  assert.equal(pp(done, 33), 0);
  assert.equal(done.battleField!.turn, 2);
  const elixir = turn(done, {
    kind: "item",
    item: "max-elixir",
    captureId: "own",
  });
  assert.equal(pp(elixir, 33), 35);
  assert.equal(pp(elixir, 150), 40);
});

test("trainer network PP item preserves metadata, executes once and consumes the action without move PP", () => {
  const setup = trainer();
  setup.networkBattleId = setup.id;
  setup.teams.a.pokemons[1].pokemon.stats[0].value = 0;
  const started = startTrainerBattle(setup, seed);
  assert.equal(started.runtime!.requests.a.moves[0].id, 165);
  const queued = chooseTrainerAction(
    started,
    "a",
    { kind: "item", item: "max-ether", captureId: "bench", moveId: 33 },
    { allowNetworkItem: true },
  );
  queued.networkItems = {
    pending: {
      a: {
        commandId: "use",
        captureId: "bench",
        itemId: "max-ether",
        moveId: 33,
      },
    },
    used: [],
  };
  assert(validTrainerBattleSession(queued));
  const calls: unknown[][] = [];
  const done = chooseTrainerAction(
    clone(queued),
    "b",
    { kind: "move", moveId: 150 },
    { onItemUsed: (...args) => calls.push(args) },
  );
  assert.deepEqual(calls, [["a", "bench", "max-ether", 33]]);
  assert.equal(done.teams.a.pokemons[1].moves![0].currentPp, 35);
  assert.equal(getCurrentHp(done.teams.a.pokemons[1].pokemon), 0);
  assert.equal(done.teams.a.pokemons[0].moves![0].currentPp, 0);
  assert.equal(done.runtime!.turn, 2);
});

test("trainer Max Elixir restores all learned PP, Full Restore preserves spent PP and no-effect rejects", () => {
  const setup = trainer();
  const first = setup.teams.a.pokemons[0];
  first.pokemon.stats[0].value = 10;
  let state = startTrainerBattle(setup, seed);
  state = chooseTrainerAction(
    chooseTrainerAction(state, "a", {
      kind: "item",
      item: "full-restore",
      captureId: "own",
    }),
    "b",
    { kind: "move", moveId: 150 },
  );
  assert.equal(state.teams.a.pokemons[0].moves![0].currentPp, 0);
  state = chooseTrainerAction(
    chooseTrainerAction(state, "a", {
      kind: "item",
      item: "max-elixir",
      captureId: "own",
    }),
    "b",
    { kind: "move", moveId: 150 },
  );
  assert.deepEqual(
    state.teams.a.pokemons[0].moves!.map((move) => move.currentPp),
    [35, 40],
  );
  assert.throws(
    () =>
      chooseTrainerAction(state, "a", {
        kind: "item",
        item: "max-elixir",
        captureId: "own",
      }),
    /efecto/,
  );
});

test("Transform borrowed slots never overwrite learned PP; Max Ether restores the original move resource", () => {
  let state = turn(wild([144, 150], 2), 144);
  assert.equal(pp(state, 144), 1);
  assert.equal(pp(state, 150), 2);
  const transformed = restoreEmeraldBattle(state.emerald!.engine).p1.active[0];
  assert(transformed.transformed);
  assert.equal(transformed.moveSlots[0].pp, 5);
  state = turn(state, 150);
  assert.equal(pp(state, 144), 1);
  assert.equal(pp(state, 150), 2);
  state = turn(state, {
    kind: "item",
    item: "max-ether",
    captureId: "own",
    moveId: 144,
  });
  assert.equal(pp(state, 144), 10);
  assert.equal(
    restoreEmeraldBattle(state.emerald!.engine).p1.active[0].moveSlots[0].pp,
    4,
  );
});

test("Sleep Talk spends its own PP while its invoked learned move keeps its PP", () => {
  const state = wild([214, 150], 3);
  state.pokemons[0].statuses = ["asleep"];
  state.pokemons[0].statusTurns = { asleep: 6 };
  const done = turn(state, 214);
  assert.equal(pp(done, 214), 2);
  assert.equal(pp(done, 150), 3);
});

test("trainer Transform with fewer borrowed moves survives reload and Elixir restores only learned resources", () => {
  const setup = trainer();
  setup.teams.a.pokemons[0] = member("own", [144, 33], 2);
  let state = startTrainerBattle(setup, seed);
  state = chooseTrainerAction(
    chooseTrainerAction(state, "a", { kind: "move", moveId: 144 }),
    "b",
    { kind: "move", moveId: 150 },
  );
  state = chooseTrainerAction(
    chooseTrainerAction(clone(state), "a", { kind: "move", moveId: 150 }),
    "b",
    { kind: "move", moveId: 150 },
  );
  assert.deepEqual(
    state.teams.a.pokemons[0].moves!.map((move) => move.currentPp),
    [1, 2],
  );
  state = chooseTrainerAction(
    chooseTrainerAction(clone(state), "a", {
      kind: "item",
      item: "max-elixir",
      captureId: "own",
    }),
    "b",
    { kind: "move", moveId: 150 },
  );
  assert.deepEqual(
    state.teams.a.pokemons[0].moves!.map((move) => move.currentPp),
    [10, 35],
  );
  assert.equal(
    restoreEmeraldBattle(state.runtime!.engine).p1.active[0].moveSlots[0].pp,
    4,
  );
});

test("Sketch spends its original learned PP across reload and Ether restores that resource without exporting the copy", () => {
  const initial = wild([166, 33], 1);
  initial.pokemons[0].pokemon.stats.find(
    (stat) => stat.name === "speed",
  )!.value = 1;
  initial.opponent!.pokemon.stats.find((stat) => stat.name === "speed")!.value =
    100;
  const done = turn(initial, 166);
  assert.equal(pp(done, 166), 0);
  assert.equal(pp(done, 33), 1);
  const native = restoreEmeraldBattle(done.emerald!.engine);
  assert.equal(native.p1.active[0].baseMoveSlots[0].id, "splash");
  const restored = turn(clone(done), {
    kind: "item",
    item: "max-ether",
    captureId: "own",
    moveId: 166,
  });
  assert.equal(pp(restored, 166), 1);
  assert.deepEqual(
    restored.pokemons[0].moves!.map((move) => move.id),
    [166, 33],
  );
  assert.equal(
    restoreEmeraldBattle(restored.emerald!.engine).p1.active[0].baseMoveSlots[0]
      .id,
    "splash",
  );
});

test("legacy native PP migration recognizes historical PokeAPI move aliases", () => {
  const initial = wild([11], 3);
  initial.pokemons[0].moves![0].name = "vice-grip";
  const done = turn(initial, 11);
  delete done.pokemons[0].moves![0].currentPp;
  assert.equal(hydratePartyMovePp(done).pokemons[0].moves![0].currentPp, 2);
});
