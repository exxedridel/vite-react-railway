import assert from "node:assert/strict";
import { test } from "node:test";
import {
  automaticCaptureOutcome,
  rollCaptureD20,
} from "../src/lib/captureRoll";
import {
  prepareAutomaticBallCaptureParty,
  validCaptureResult,
} from "../src/lib/shop/ballCapture";
import partyReducer, { type PartyState } from "../src/slices/partySlice";
import {
  createLeveledPokemon,
  getCurrentHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import { emptyBattleField } from "../src/lib/battleField";
import { getCurrentMovePp } from "../src/lib/movePp";
import { combatKey } from "../src/lib/emerald/types";
import type { CapturedPokemon } from "../src/types/pokemon";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const seed: [number, number, number, number] = [1, 2, 3, 4];
const identity = {
  userId: 2,
  clientId: "auto-capture-browser",
  requestId: "auto-capture-operation",
};
function member(captureId: string): CapturedPokemon {
  const species = trainerSpecies.find((entry) => entry.id === 143)!;
  return {
    captureId,
    pokemon: createLeveledPokemon(
      {
        id: species.id,
        name: species.name,
        image: null,
        types: [...species.types],
        stats: clone(species.baseStats),
        learnset: {
          versionGroup: "emerald",
          moves: [{ id: 33, name: "tackle" }],
        },
      },
      undefined,
      50,
    ),
    moves: [
      {
        ...clone(trainerMoves.find((entry) => entry.id === 33)!),
        currentPp: 5,
        source: "wild",
      },
    ],
    statuses: [],
    statusTurns: {},
  };
}
function fixture(): PartyState {
  const initial = partyReducer(undefined, { type: "test/initial" });
  const wild = member("wild");
  return {
    ...initial,
    gameSettings: {
      version: 1,
      ruleset: "rse-emerald",
      regions: ["kanto"],
      startingLevel: 5,
      hpMultiplier: 1.3,
    },
    starterClaimed: true,
    pokemons: [member("own")],
    bag: {
      ...initial.bag!,
      items: { "poke-ball": 2, "great-ball": 2, "ultra-ball": 2 },
    },
    opponent: {
      kind: "wild",
      encounterId: "automatic-encounter",
      pokemon: wild.pokemon,
      moves: wild.moves,
      statuses: [],
      statusTurns: {},
      stages: neutralBattleStages(),
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
const plan = (party: PartyState, roll: number, difficulty = 0) =>
  prepareAutomaticBallCaptureParty(
    party,
    "own",
    "great-ball",
    identity,
    seed,
    "fixed-capture-id",
    undefined,
    { captureDifficulty: difficulty, captureRevision: 7 },
    () => roll,
  );

test("D20 covers every face and rejects the unsigned tail instead of biasing 1..16", () => {
  assert.deepEqual(
    Array.from({ length: 20 }, (_, value) => rollCaptureD20(() => value)),
    Array.from({ length: 20 }, (_, value) => value + 1),
  );
  const samples = [0xffffffff, 0xfffffff0, 19];
  assert.equal(
    rollCaptureD20(() => samples.shift()!),
    20,
  );
  assert.equal(samples.length, 0);
  for (const bad of [-1, 1.5, NaN, 0x100000000])
    assert.throws(() => rollCaptureD20(() => bad));
});
test("capture compares D20 with the current threshold, including equality, with no critical bypass", () => {
  assert.equal(automaticCaptureOutcome(10, 10), "caught");
  assert.equal(automaticCaptureOutcome(9, 10), "escaped");
  assert.equal(automaticCaptureOutcome(1, 1), "caught");
  assert.equal(automaticCaptureOutcome(20, 20), "caught");
  assert.throws(() => automaticCaptureOutcome(20, 21));
});
test("success plans a single fixed capture and preserves the wild HP, primary status and PP", async () => {
  const party = fixture();
  party.opponent!.statuses = ["poisoned", "confused"];
  party.opponent!.statusTurns = { confused: 3 };
  party.opponent!.pokemon.stats.find((entry) => entry.name === "hp")!.value =
    50;
  const before = clone(party);
  const next = await plan(party, 20);
  assert.deepEqual(party, before);
  assert.equal(next.pokemons.length, 2);
  assert.equal(next.pokemons[1].captureId, "fixed-capture-id");
  assert.equal(getCurrentHp(next.pokemons[1].pokemon), 50);
  assert.deepEqual(next.pokemons[1].statuses, ["poisoned"]);
  assert.equal(getCurrentMovePp(next.pokemons[1].moves![0]), 5);
  assert.equal(next.opponent, null);
  assert.equal(next.captureAttempt, undefined);
  assert.equal(next.lastCaptureResult!.roll, 20);
  assert.equal(next.lastCaptureResult!.outcome, "caught");
  assert(validCaptureResult(next.lastCaptureResult));
  assert.deepEqual(
    next.bag,
    party.bag,
    "only the caller's atomic debit/outbox coordinator consumes stock",
  );
});
test("a failed automatic throw uses one action and one enemy reply, without spending own PP", async () => {
  const party = fixture();
  const next = await plan(party, 1);
  const retry = await plan(clone(party), 1);
  assert.equal(combatKey(next), combatKey(retry));
  assert.deepEqual(next.lastCaptureResult, retry.lastCaptureResult);
  assert.equal(next.pokemons.length, 1);
  assert.equal(next.lastCaptureResult!.outcome, "escaped");
  assert.equal(next.lastCaptureResult!.roll, 1);
  assert.equal(next.battleField!.turn, 2);
  assert.equal(getCurrentMovePp(next.pokemons[0].moves![0]), 5);
  assert.equal(getCurrentMovePp(next.opponent!.moves![0]), 4);
  assert(
    getCurrentHp(next.pokemons[0].pokemon) <
      getCurrentHp(party.pokemons[0].pokemon),
  );
  assert.deepEqual(next.emerald!.pending, {});
});
test("an impossible threshold is rejected before drawing, charging or modifying the encounter", async () => {
  const party = fixture(),
    before = clone(party);
  let draws = 0;
  await assert.rejects(
    prepareAutomaticBallCaptureParty(
      party,
      "own",
      "great-ball",
      identity,
      seed,
      "fixed-capture-id",
      undefined,
      { captureDifficulty: 20, captureRevision: 9 },
      () => {
        draws++;
        return 20;
      },
    ),
    /imposible|supera 20/,
  );
  assert.equal(draws, 0);
  assert.deepEqual(party, before);
});
test("stock0 and trainer encounters cannot perform an automatic throw", async () => {
  const empty = fixture();
  empty.bag!.items!["great-ball"] = 0;
  await assert.rejects(plan(empty, 20), /existencias/);
  const trainer = fixture();
  trainer.opponent!.kind = "trainer";
  await assert.rejects(plan(trainer, 20), /salvaje/);
});
test("new results validate the saved die/outcome together while old results retain their shape", async () => {
  const result = (await plan(fixture(), 20)).lastCaptureResult!;
  assert.equal(validCaptureResult({ ...result, roll: 1, minimum: 20 }), false);
  assert.equal(validCaptureResult({ ...result, minimum: undefined }), false);
  assert.equal(validCaptureResult({ ...result, roll: 21 }), false);
  const { roll: _roll, minimum: _minimum, ...legacy } = result;
  assert(validCaptureResult(legacy));
});
