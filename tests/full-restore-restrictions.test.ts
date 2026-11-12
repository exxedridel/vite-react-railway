import assert from "node:assert/strict";
import { test } from "node:test";
import { configureStore } from "@reduxjs/toolkit";
import { Battle } from "@pkmn/sim";
import reducer, {
  fullRestorePokemon,
  type PartyState,
} from "../src/slices/partySlice";
import { emeraldMoves, runEmeraldAction } from "../src/lib/emerald/engine";
import { emptyBattleField } from "../src/lib/battleField";
import {
  createLeveledPokemon,
  neutralBattleStages,
  STAT_NAMES,
} from "../src/lib/pokemonStats";
import type { LearnedMove } from "../src/types/moves";

const seed: [number, number, number, number] = [1, 2, 3, 4];

function move(id: number): LearnedMove {
  const data = emeraldMoves.find((candidate) => candidate.num === id)!;
  return {
    id,
    name: data.id,
    displayName: data.name,
    type: data.type.toLowerCase(),
    damageClass: data.category.toLowerCase() as LearnedMove["damageClass"],
    power: data.basePower,
    accuracy: typeof data.accuracy === "number" ? data.accuracy : null,
    pp: data.pp,
    priority: data.priority,
    description: data.desc,
    source: "wild",
  };
}

function pokemon(speed: number) {
  const pokemon = createLeveledPokemon(
    {
      id: 143,
      name: "snorlax",
      image: null,
      types: ["normal"],
      stats: [160, 110, 65, 65, 110, 30].map((value, index) => ({
        name: STAT_NAMES[index],
        value,
      })),
    },
    undefined,
    50,
  );
  pokemon.stats.find((stat) => stat.name === "speed")!.value = speed;
  return pokemon;
}

function fixture(own: number[], foe: number[]): PartyState {
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: [
      {
        captureId: "own",
        pokemon: pokemon(300),
        moves: own.map(move),
        statuses: [],
      },
      {
        captureId: "bench",
        pokemon: pokemon(100),
        moves: [move(150)],
        statuses: [],
      },
    ],
    opponent: {
      pokemon: pokemon(1),
      kind: "wild",
      encounterId: "restore-restrictions",
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
  moveId: number,
): PartyState {
  return {
    ...state,
    ...runEmeraldAction(
      state,
      "own",
      side,
      { kind: "move", moveId },
      seed,
      `${state.emerald?.serial ?? 0}-${side}`,
    ),
  };
}

function turn(state: PartyState, own: number, foe: number) {
  return choose(choose(state, "player", own), "opponent", foe);
}

async function restore(state: PartyState) {
  const before = Battle.fromJSON(state.emerald!.engine);
  const queued = {
    ...state,
    ...runEmeraldAction(
      state,
      "own",
      "player",
      { kind: "item", item: "full-restore", captureId: "own" },
      seed,
      "restore",
    ),
  };
  const restored = choose(queued, "opponent", 150);
  const after = Battle.fromJSON(restored.emerald!.engine);
  assert.equal(after.turn, before.turn + 1);
  assert.deepEqual(
    after.p1.pokemon[0].moveSlots.map((slot) => [slot.id, slot.pp]),
    before.p1.pokemon[0].moveSlots.map((slot) => [slot.id, slot.pp]),
  );
  return restored;
}

test("Full restore releases on its turn Torment's cached move restriction", async () => {
  const state = turn(fixture([33, 150], [259, 150]), 33, 259);
  assert(state.pokemons[0].statuses?.includes("tormented"));
  assert.equal(
    state.emerald!.requests.player.moves.find((entry) => entry.id === 33)
      ?.disabled,
    true,
  );
  const restored = await restore(state);
  assert.equal(
    restored.emerald!.requests.player.moves.find((entry) => entry.id === 33)
      ?.disabled,
    false,
  );
  assert.doesNotThrow(() => choose(restored, "player", 33));
});

test("Full restore releases on its turn Bind's cached trapping restriction", async () => {
  const initial = fixture([150, 33], [20, 150]);
  initial.opponent!.stages.accuracy = 6;
  const state = turn(initial, 150, 20);
  assert(state.pokemons[0].statuses?.includes("bound"));
  assert.equal(state.emerald!.requests.player.trapped, true);
  const restored = await restore(state);
  assert.equal(restored.emerald!.requests.player.trapped, false);
  const switched = runEmeraldAction(
    restored,
    "own",
    "player",
    { kind: "switch", captureId: "bench" },
    seed,
    "after-restore-switch",
  );
  assert.equal(switched.emerald!.pending.player?.kind, "switch");
});

test("Full restore preserves the opposing Imprison restriction while refreshing legal moves", async () => {
  const initial = fixture([150, 33, 43], [286, 33, 150]);
  initial.pokemons[0].pokemon.stats[0].value = 40;
  const state = turn(initial, 150, 286);
  const before = Battle.fromJSON(state.emerald!.engine);
  assert.equal(
    before.p1.pokemon[0].moveSlots.find((entry) => entry.id === "tackle")
      ?.disabled,
    "hidden",
  );
  const restored = await restore(state);
  const after = Battle.fromJSON(restored.emerald!.engine);
  for (const id of ["tackle", "splash"])
    assert.equal(
      after.p1.pokemon[0].moveSlots.find((entry) => entry.id === id)?.disabled,
      "hidden",
    );
  assert.equal(
    restored.emerald!.requests.player.moves.find((entry) => entry.id === 43)
      ?.disabled,
    false,
  );
  assert.doesNotThrow(() => choose(restored, "player", 43));
});

test("Full Restore cannot replace a previously chosen move", async () => {
  const initial = fixture([150, 33], [150, 33]);
  initial.pokemons[0].pokemon.stats[0].value = 40;
  const state = choose(initial, "player", 150);
  assert.throws(
    () =>
      runEmeraldAction(
        state,
        "own",
        "player",
        { kind: "item", item: "full-restore", captureId: "own" },
        seed,
        "invalid",
      ),
    /eligi?/,
  );
});
