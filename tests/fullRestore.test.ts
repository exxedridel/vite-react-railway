import assert from "node:assert/strict";
import { test } from "node:test";
import { configureStore } from "@reduxjs/toolkit";
import { Battle, Dex } from "@pkmn/sim";
import reducer, {
  changePokemonHp,
  fullRestorePokemon,
  type PartyState,
} from "../src/slices/partySlice";
import { emeraldMoves, runEmeraldAction } from "../src/lib/emerald/engine";
import type { EmeraldChoice } from "../src/lib/emerald/types";
import { emptyBattleField } from "../src/lib/battleField";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
  STAT_NAMES,
} from "../src/lib/pokemonStats";
import { STATUS_OPTIONS } from "../src/types/pokemon";
import type { LearnedMove } from "../src/types/moves";

const dex = Dex.forGen(3);
const seed: [number, number, number, number] = [1, 2, 3, 4];
function move(id: number): LearnedMove {
  const m = emeraldMoves.find((candidate) => candidate.num === id)!;
  return {
    id,
    name: m.id,
    displayName: m.name,
    type: m.type.toLowerCase(),
    damageClass: m.category.toLowerCase() as LearnedMove["damageClass"],
    power: m.basePower,
    accuracy: typeof m.accuracy === "number" ? m.accuracy : null,
    pp: m.pp,
    priority: m.priority,
    description: m.desc,
    source: "wild",
  };
}
function pokemon(name: string) {
  const spec = dex.species.get(name);
  return createLeveledPokemon(
    {
      id: spec.num,
      name: spec.id,
      image: null,
      types: spec.types.map((type) => type.toLowerCase()),
      stats: Object.values(spec.baseStats).map((value, index) => ({
        name: STAT_NAMES[index],
        value,
      })),
    },
    undefined,
    50,
  );
}
function fixture(own = [150, 33], foe = [150]): PartyState {
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: [
      {
        captureId: "own",
        pokemon: pokemon("snorlax"),
        moves: own.map(move),
        statuses: [],
      },
      {
        captureId: "bench",
        pokemon: pokemon("blissey"),
        moves: [move(150)],
        statuses: [],
      },
    ],
    opponent: {
      pokemon: pokemon("gengar"),
      kind: "wild",
      encounterId: "restore-encounter",
      moves: foe.map(move),
      stages: neutralBattleStages(),
      statuses: [],
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
function turn(state: PartyState, own: number, foe: number) {
  return choose(choose(state, "player", own), "opponent", foe);
}
function makeStore(party: PartyState) {
  return configureStore({
    reducer: { party: reducer },
    preloadedState: { party },
  });
}

test("Full restore heals a fainted target, removes every status/counter and resets all seven stages", async () => {
  const initial = fixture();
  const target = initial.pokemons[0];
  target.pokemon.stats[0].value = 0;
  target.statuses = STATUS_OPTIONS.map((status) => status.id);
  target.statusTurns = {
    asleep: 3,
    confused: 2,
    taunted: 1,
    bound: 4,
    disabled: 2,
    encored: 5,
    "perish-song": 1,
  };
  target.pokemon.battleStages = {
    attack: 6,
    defense: -6,
    "special-attack": 2,
    "special-defense": -3,
    speed: 4,
    accuracy: -1,
    evasiveness: 5,
  };
  const untouched = JSON.stringify([
    initial.pokemons[1],
    initial.opponent,
    initial.battleField,
    initial.bag,
  ]);
  const oldStats = target.pokemon.stats.filter((stat) => stat.name !== "hp");
  const store = makeStore(initial);
  const result = store.dispatch(fullRestorePokemon("own"));
  // Outside automatic combat the mutation is immediate, with no simulator load.
  assert.equal(
    getCurrentHp(store.getState().party.pokemons[0].pokemon),
    getMaxHp(target.pokemon),
  );
  await result;
  const restored = store.getState().party;
  assert.deepEqual(restored.pokemons[0].statuses, []);
  assert.deepEqual(restored.pokemons[0].statusTurns, {});
  assert.deepEqual(
    restored.pokemons[0].pokemon.battleStages,
    neutralBattleStages(),
  );
  assert.deepEqual(
    restored.pokemons[0].pokemon.stats.filter((stat) => stat.name !== "hp"),
    oldStats,
  );
  assert.deepEqual(restored.pokemons[0].moves, target.moves);
  assert.equal(
    JSON.stringify([
      restored.pokemons[1],
      restored.opponent,
      restored.battleField,
      restored.bag,
    ]),
    untouched,
  );
  assert.equal(restored.activityHistory?.length, 1);
  assert.equal(restored.activityHistory?.[0].title, "Full restore: snorlax");
  assert.equal(restored.activityHistory?.[0].captureId, "own");
});

test("unknown or unmigrated targets cannot change the party or log a restore", async () => {
  const initial = fixture();
  delete initial.pokemons[0].pokemon.progressionVersion;
  const store = makeStore(initial);
  const before = store.getState();
  await store.dispatch(fullRestorePokemon("missing"));
  await store.dispatch(fullRestorePokemon("own"));
  assert.equal(store.getState(), before);
});

test("active restore preserves queued choice, PP, PRNG and turn, and the next turn stays cured", async () => {
  const initial = fixture();
  initial.pokemons[0].statuses = [
    "burned",
    "confused",
    "perish-song",
    "leech-seed",
  ];
  initial.pokemons[0].statusTurns = { confused: 3, "perish-song": 2 };
  initial.pokemons[0].pokemon.battleStages = {
    ...neutralBattleStages(),
    attack: -3,
    speed: 4,
    accuracy: -2,
    evasiveness: 3,
  };
  initial.pokemons[0].pokemon.stats[0].value = 40;
  const queued = choose(initial, "opponent", 150);
  const before = Battle.fromJSON(queued.emerald!.engine);
  const store = makeStore(queued);
  await store.dispatch(fullRestorePokemon("own"));
  const restored = store.getState().party;
  const after = Battle.fromJSON(restored.emerald!.engine);
  assert.deepEqual(after.prng.getSeed(), before.prng.getSeed());
  assert.deepEqual(after.p1.active[0].moveSlots, before.p1.active[0].moveSlots);
  assert.deepEqual(restored.emerald!.pending, queued.emerald!.pending);
  assert.deepEqual(restored.battleField, queued.battleField);
  assert.equal(after.p1.active[0].status, "");
  assert.equal(after.p1.active[0].hp, after.p1.active[0].maxhp);
  const next = choose(restored, "player", 150);
  assert.deepEqual(next.pokemons[0].statuses, []);
  assert.deepEqual(next.pokemons[0].statusTurns, {});
  assert.deepEqual(
    next.pokemons[0].pokemon.battleStages,
    neutralBattleStages(),
  );
  assert.equal(
    getCurrentHp(next.pokemons[0].pokemon),
    getMaxHp(next.pokemons[0].pokemon),
  );
  assert.equal(next.battleField!.turn, queued.battleField!.turn + 1);
});

for (const [name, effect, ownMove, blockedMove] of [
  ["Taunt", 269, 150, 150],
  ["Disable", 50, 33, 33],
] as const) {
  test(`restore clears ${name} and enables its blocked move immediately`, async () => {
    let state = fixture([150, 33], [effect, 150]);
    // Let the player act first so Disable has a previous move to disable.
    state.pokemons[0].pokemon.stats.find(
      (stat) => stat.name === "speed",
    )!.value = 999;
    state.opponent!.stages.accuracy = 6;
    state = turn(state, ownMove, effect);
    assert.equal(
      state.emerald!.requests.player.moves.find(
        (move) => move.id === blockedMove,
      )?.disabled,
      true,
    );
    const store = makeStore(state);
    await store.dispatch(fullRestorePokemon("own"));
    const restored = store.getState().party;
    assert.equal(
      restored.emerald!.requests.player.moves.find(
        (move) => move.id === blockedMove,
      )?.disabled,
      false,
    );
    assert.doesNotThrow(() => choose(restored, "player", blockedMove));
  });
}

for (const [name, effect] of [
  ["Curse", 174],
  ["Yawn", 281],
  ["Nightmare", 171],
] as const) {
  test(`restore cancels hidden ${name} without triggering residuals or consuming randomness`, async () => {
    const initial = fixture([150], [effect, 150]);
    if (name === "Nightmare") {
      initial.pokemons[0].statuses = ["asleep"];
      initial.pokemons[0].statusTurns = { asleep: 6 };
    }
    const affected = turn(initial, 150, effect);
    const before = Battle.fromJSON(affected.emerald!.engine);
    assert(before.p1.active[0].volatiles[name.toLowerCase()]);
    const store = makeStore(affected);
    await store.dispatch(fullRestorePokemon("own"));
    const restored = store.getState().party;
    const after = Battle.fromJSON(restored.emerald!.engine);
    assert.equal(after.p1.active[0].volatiles[name.toLowerCase()], undefined);
    assert.equal(after.p1.active[0].status, "");
    assert.deepEqual(after.prng.getSeed(), before.prng.getSeed());
    const next = turn(restored, 150, 150);
    assert.equal(
      getCurrentHp(next.pokemons[0].pokemon),
      getMaxHp(next.pokemons[0].pokemon),
    );
    assert.deepEqual(next.pokemons[0].statuses, []);
  });
}

test("restore heals a fainted benched Pokémon without changing the active participant or its PP", async () => {
  const initial = fixture();
  initial.pokemons[1].pokemon.stats[0].value = 0;
  initial.pokemons[1].statuses = ["poisoned"];
  const state = turn(initial, 150, 150);
  const store = makeStore(state);
  await store.dispatch(fullRestorePokemon("bench"));
  const restored = store.getState().party;
  const battle = Battle.fromJSON(restored.emerald!.engine);
  const bench = battle.p1.pokemon.find(
    (pokemon) => pokemon.set.name === "bench",
  )!;
  assert.equal(bench.hp, bench.maxhp);
  assert.equal(bench.fainted, false);
  assert.equal(bench.status, "");
  assert.equal(battle.p1.pokemonLeft, 2);
  assert.equal(restored.battleField!.activeCaptureId, "own");
  assert.deepEqual(
    restored.emerald!.requests.player.moves,
    state.emerald!.requests.player.moves,
  );
  assert.doesNotThrow(() =>
    choose(restored, "player", { kind: "switch", captureId: "bench" }),
  );
});

test("a concurrent correction rejects an outdated restore without overwriting it", async () => {
  const store = makeStore(choose(fixture(), "opponent", 150));
  const pending = store.dispatch(fullRestorePokemon("own"));
  store.dispatch(changePokemonHp({ captureId: "own", amount: -10 }));
  const corrected = store.getState();
  await assert.rejects(pending, /combate cambió/);
  assert.equal(store.getState(), corrected);
  assert(
    !corrected.party.activityHistory?.some((entry) =>
      entry.title.startsWith("Full restore"),
    ),
  );
});
