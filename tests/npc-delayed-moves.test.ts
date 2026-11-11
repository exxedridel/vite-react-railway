import assert from "node:assert/strict";
import { test } from "node:test";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import { createLeveledPokemon } from "../src/lib/pokemonStats";
import { createTrainerBattleSession } from "../src/lib/trainerBattle/model";
import {
  startTrainerBattle,
  chooseTrainerAction,
} from "../src/lib/trainerBattle/engine";
import { chooseNpcTrainerAction } from "../src/lib/trainerBattle/npcAi";
import type {
  TrainerBattleSession,
  TrainerChoice,
  TrainerPokemon,
} from "../src/lib/trainerBattle/types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const seed: [number, number, number, number] = [1, 2, 3, 4];

function capture(
  id: string,
  speciesId: number,
  moves: number[],
): TrainerPokemon {
  const species = trainerSpecies.find((entry) => entry.id === speciesId)!;
  return {
    captureId: id,
    pokemon: createLeveledPokemon(
      { ...species, stats: clone(species.baseStats), image: null },
      species.baseStats,
      50,
      1.3,
    ),
    moves: moves.map((moveId) =>
      clone(trainerMoves.find((move) => move.id === moveId)!),
    ),
    statuses: [],
    statusTurns: {},
  };
}

function fixture(moves = [248, 150], reserves = false): TrainerBattleSession {
  const setup = createTrainerBattleSession();
  setup.teams.a = {
    name: "Player",
    activeCaptureId: "a0",
    pokemons: [
      capture("a0", 242, [150]),
      ...(reserves ? [capture("a1", 242, [150])] : []),
    ],
  };
  setup.teams.b = {
    name: "NPC",
    activeCaptureId: "b0",
    pokemons: [
      capture("b0", 65, moves),
      ...(reserves ? [capture("b1", 65, moves)] : []),
    ],
  };
  return startTrainerBattle(setup, seed);
}

function turn(
  session: TrainerBattleSession,
  bChoice: TrainerChoice,
  aChoice: TrainerChoice = { kind: "move", moveId: 150 },
): TrainerBattleSession {
  return chooseTrainerAction(
    chooseTrainerAction(session, "a", aChoice),
    "b",
    bChoice,
  );
}

for (const delayed of [248, 353]) {
  test(`NPC avoids both delayed attacks while native futuremove from ${delayed} is pending and can cast again after impact`, () => {
    let session = turn(fixture([delayed, 150]), {
      kind: "move",
      moveId: delayed,
    });
    assert.ok(
      JSON.parse(session.runtime!.engine).sides[0].slotConditions[0].futuremove,
    );
    const saved = JSON.stringify(session);
    assert.deepEqual(chooseNpcTrainerAction(session), {
      kind: "move",
      moveId: 150,
    });
    assert.equal(
      JSON.stringify(session),
      saved,
      "Choosing an action must not mutate the checkpoint or PRNG",
    );
    const queuedPlayer = clone(session);
    queuedPlayer.runtime!.pending.a = {
      kind: "switch",
      captureId: "irrelevant-pending-choice",
    };
    assert.deepEqual(chooseNpcTrainerAction(queuedPlayer), {
      kind: "move",
      moveId: 150,
    });
    session = turn(clone(session), { kind: "move", moveId: 150 });
    assert.deepEqual(
      chooseNpcTrainerAction(clone(session)),
      { kind: "move", moveId: 150 },
      "JSON recovery must preserve knowledge of the pending attack",
    );
    session = turn(clone(session), { kind: "move", moveId: 150 });
    assert.equal(
      JSON.parse(session.runtime!.engine).sides[0].slotConditions[0].futuremove,
      undefined,
    );
    assert.deepEqual(chooseNpcTrainerAction(session), {
      kind: "move",
      moveId: delayed,
    });
  });
}

test("NPC tracks the target position across both source and target replacements, not the old capture IDs", () => {
  let session = turn(fixture([248, 353, 150], true), {
    kind: "move",
    moveId: 248,
  });
  session = turn(
    clone(session),
    { kind: "switch", captureId: "b1" },
    { kind: "switch", captureId: "a1" },
  );
  assert.equal(session.teams.a.activeCaptureId, "a1");
  assert.equal(session.teams.b.activeCaptureId, "b1");
  assert.ok(
    JSON.parse(session.runtime!.engine).sides[0].slotConditions[0].futuremove,
  );
  assert.deepEqual(chooseNpcTrainerAction(session), {
    kind: "move",
    moveId: 150,
  });
});

test("a pending Future Sight also blocks selecting Doom Desire, without blocking ordinary repeated attacks", () => {
  let session = turn(fixture([248, 353, 150]), { kind: "move", moveId: 248 });
  assert.deepEqual(chooseNpcTrainerAction(session), {
    kind: "move",
    moveId: 150,
  });
  session = turn(session, { kind: "move", moveId: 150 });
  assert.deepEqual(chooseNpcTrainerAction(session), {
    kind: "move",
    moveId: 150,
  });
});

test("when every offered move is already pending the NPC switches legally, or keeps a native legal fallback if trapped or alone", () => {
  const pending = turn(fixture([248], true), { kind: "move", moveId: 248 });
  assert.deepEqual(chooseNpcTrainerAction(pending), {
    kind: "switch",
    captureId: "b1",
  });
  const trapped = clone(pending);
  trapped.runtime!.requests.b.trapped = true;
  assert.deepEqual(chooseNpcTrainerAction(trapped), {
    kind: "move",
    moveId: 248,
  });
  const alone = turn(fixture([248]), { kind: "move", moveId: 248 });
  assert.deepEqual(chooseNpcTrainerAction(alone), {
    kind: "move",
    moveId: 248,
  });
  assert.doesNotThrow(() =>
    chooseTrainerAction(alone, "b", chooseNpcTrainerAction(alone)!),
  );
});
