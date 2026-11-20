import assert from "node:assert/strict";
import { test } from "node:test";
import partyReducer, { type PartyState } from "../src/slices/partySlice";
import {
  prepareAutomaticBallCaptureParty,
  validCaptureResult,
} from "../src/lib/shop/ballCapture";
import {
  createLeveledPokemon,
  getCurrentHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import { emptyBattleField } from "../src/lib/battleField";
import { getCurrentMovePp } from "../src/lib/movePp";
import { captureRequirements } from "../src/lib/captureRates";
import { combatKey } from "../src/lib/emerald/types";
import { decodeAccountParty } from "../src/store/accountStorage";
import type { CapturedPokemon } from "../src/types/pokemon";
import type { CaptureQuote } from "../src/lib/shop/types";
import {
  captureThrowHits,
  captureSlingshotLanding,
  THROW_ORIGIN,
  THROW_TARGET,
} from "../src/lib/captureThrow";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const identity = { userId: 2, clientId: "aim-client", requestId: "aim-shot" };
const seed: [number, number, number, number] = [1, 2, 3, 4];
const settings = { captureDifficulty: 0, captureRevision: 7 };
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
      encounterId: "aim-encounter",
      pokemon: wild.pokemon,
      moves: wild.moves,
      statuses: [],
      statusTurns: {},
      stages: neutralBattleStages(),
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
function quote(party: PartyState): CaptureQuote {
  return {
    minimum: captureRequirements(
      party.opponent!.pokemon,
      party.opponent!.statuses,
      0,
    )!.balls.find((ball) => ball.id === "great")!.minimum!,
    encounterId: party.opponent!.encounterId!,
    captureDifficulty: 0,
    captureRevision: 7,
  };
}
const plan = (
  party: PartyState,
  hit: boolean | undefined,
  roll: () => number,
) =>
  prepareAutomaticBallCaptureParty(
    party,
    "own",
    "great-ball",
    identity,
    seed,
    "aim-captured",
    quote(party),
    settings,
    roll,
    hit,
  );

test("an aimed miss never invokes capture D20 and freezes its quoted minimum without a die", async () => {
  const party = fixture(),
    before = clone(party),
    quoted = quote(party);
  const next = await plan(party, false, () => {
    throw new Error("capture D20 must not run");
  });
  assert.deepEqual(party, before);
  assert.equal(next.pokemons.length, 1);
  assert.deepEqual(next.lastCaptureResult, {
    attemptId: identity.requestId,
    userId: 2,
    ballId: "great-ball",
    pokemonName: party.opponent!.pokemon.name,
    outcome: "escaped",
    throwHit: false,
    minimum: quoted.minimum,
  });
  assert(validCaptureResult(next.lastCaptureResult));
  assert.equal(next.captureAttempt, undefined);
  assert.deepEqual(
    next.bag,
    party.bag,
    "the atomic item coordinator owns the single stock debit",
  );
});

test("an aimed miss spends the action and resolves exactly one wild reply without spending player move PP", async () => {
  const party = fixture();
  const next = await plan(party, false, () => {
    throw new Error("no D20");
  });
  assert.equal(next.battleField!.turn, 2);
  assert.equal(getCurrentMovePp(next.pokemons[0].moves![0]), 5);
  assert.equal(getCurrentMovePp(next.opponent!.moves![0]), 4);
  assert(
    getCurrentHp(next.pokemons[0].pokemon) <
      getCurrentHp(party.pokemons[0].pokemon),
  );
  assert.deepEqual(next.emerald!.pending, {});
  const retry = await plan(clone(party), false, () => {
    throw new Error("no retry D20");
  });
  assert.equal(combatKey(retry), combatKey(next));
  assert.deepEqual(retry.lastCaptureResult, next.lastCaptureResult);
});

test("a hit runs the existing D20 capture and preserves the caught Pokémon HP, primary status and PP", async () => {
  const party = fixture();
  party.opponent!.pokemon.stats.find((stat) => stat.name === "hp")!.value = 50;
  party.opponent!.statuses = ["poisoned", "confused"];
  let draws = 0;
  const next = await plan(party, true, () => {
    draws++;
    return 20;
  });
  assert.equal(draws, 1);
  assert.equal(next.lastCaptureResult!.throwHit, true);
  assert.equal(next.lastCaptureResult!.outcome, "caught");
  assert.equal(next.lastCaptureResult!.roll, 20);
  assert.equal(next.pokemons.length, 2);
  assert.equal(next.pokemons[1].captureId, "aim-captured");
  assert.equal(getCurrentHp(next.pokemons[1].pokemon), 50);
  assert.deepEqual(next.pokemons[1].statuses, ["poisoned"]);
  assert.equal(getCurrentMovePp(next.pokemons[1].moves![0]), 5);
  assert.equal(next.opponent, null);
});

test("hitting the target still permits a failed D20 and the normal wild response", async () => {
  let draws = 0;
  const next = await plan(fixture(), true, () => {
    draws++;
    return 1;
  });
  assert.equal(draws, 1);
  assert.equal(next.lastCaptureResult!.throwHit, true);
  assert.equal(next.lastCaptureResult!.roll, 1);
  assert.equal(next.lastCaptureResult!.outcome, "escaped");
  assert.equal(next.battleField!.turn, 2);
  assert.equal(getCurrentMovePp(next.opponent!.moves![0]), 4);
});

test("stock and stale quotes reject both hits and misses before any effect or capture die", async () => {
  for (const hit of [true, false]) {
    const party = fixture(),
      before = clone(party);
    party.bag!.items!["great-ball"] = 0;
    let draws = 0;
    await assert.rejects(
      plan(party, hit, () => {
        draws++;
        return 20;
      }),
      /existencias/,
    );
    assert.equal(draws, 0);
    assert.equal(party.opponent!.encounterId, before.opponent!.encounterId);
    const stale = fixture(),
      quoted = quote(stale);
    await assert.rejects(
      prepareAutomaticBallCaptureParty(
        stale,
        "own",
        "great-ball",
        identity,
        seed,
        "aim-captured",
        { ...quoted, minimum: quoted.minimum + 1 },
        settings,
        () => {
          draws++;
          return 20;
        },
        hit,
      ),
      /cambi[oó]/,
    );
    assert.equal(draws, 0);
  }
});

test("new aiming result validation and account reload reject inconsistent hit/miss metadata", async () => {
  const miss = (
    await plan(fixture(), false, () => {
      throw new Error("no D20");
    })
  ).lastCaptureResult!;
  const encode = (result: unknown) =>
    JSON.stringify({
      party: JSON.stringify({ ...fixture(), lastCaptureResult: result }),
    });
  assert(decodeAccountParty(encode(miss)));
  for (const invalid of [
    { ...miss, throwHit: "false" },
    { ...miss, outcome: "caught", captureId: "forged" },
    { ...miss, roll: 20 },
    { ...miss, minimum: undefined },
    { ...miss, minimum: 21 },
    { ...miss, throwHit: true },
    {
      ...miss,
      throwHit: true,
      roll: 1,
      outcome: "caught",
      captureId: "forged",
    },
  ]) {
    assert.equal(validCaptureResult(invalid), false);
    assert.throws(() => decodeAccountParty(encode(invalid)));
  }
  const hit = (await plan(fixture(), true, () => 20)).lastCaptureResult!;
  assert(validCaptureResult(hit));
  assert(decodeAccountParty(encode(hit)));
});

test("legacy automatic and paid-result shapes retain their existing D20 behavior", async () => {
  const next = await plan(fixture(), undefined, () => 20);
  assert.equal(next.lastCaptureResult!.outcome, "caught");
  assert.equal(next.lastCaptureResult!.roll, 20);
  assert.equal(
    Object.prototype.hasOwnProperty.call(next.lastCaptureResult, "throwHit"),
    false,
  );
  assert(validCaptureResult(next.lastCaptureResult));
  const { roll: _roll, minimum: _minimum, ...legacy } = next.lastCaptureResult!;
  assert(validCaptureResult(legacy));
  assert(
    decodeAccountParty(
      JSON.stringify({
        party: JSON.stringify({ ...fixture(), lastCaptureResult: legacy }),
      }),
    ),
  );
});

test("aim geometry recognizes the target center and rejects the ball origin", () => {
  assert.equal(captureThrowHits(THROW_TARGET, 400, 320), true);
  assert.equal(captureThrowHits(THROW_ORIGIN, 400, 320), false);
});

test("aim geometry distinguishes releases immediately inside and outside the circular boundary", () => {
  const width = 400,
    height = 320;
  const radius = Math.min(width * 0.125, height * 0.105);
  for (const direction of [-1, 1]) {
    assert.equal(
      captureThrowHits(
        {
          x: THROW_TARGET.x + (direction * (radius - 0.01)) / width,
          y: THROW_TARGET.y,
        },
        width,
        height,
      ),
      true,
    );
    assert.equal(
      captureThrowHits(
        {
          x: THROW_TARGET.x + (direction * (radius + 0.01)) / width,
          y: THROW_TARGET.y,
        },
        width,
        height,
      ),
      false,
    );
    assert.equal(
      captureThrowHits(
        {
          x: THROW_TARGET.x,
          y: THROW_TARGET.y + (direction * (radius - 0.01)) / height,
        },
        width,
        height,
      ),
      true,
    );
    assert.equal(
      captureThrowHits(
        {
          x: THROW_TARGET.x,
          y: THROW_TARGET.y + (direction * (radius + 0.01)) / height,
        },
        width,
        height,
      ),
      false,
    );
  }
});

test("aim geometry rejects square corners that lie outside the target circle", () => {
  const width = 400,
    height = 320;
  const radius = Math.min(width * 0.125, height * 0.105);
  assert.equal(
    captureThrowHits(
      {
        x: THROW_TARGET.x + (radius * 0.9) / width,
        y: THROW_TARGET.y + (radius * 0.9) / height,
      },
      width,
      height,
    ),
    false,
  );
  assert.equal(
    captureThrowHits(
      {
        x: THROW_TARGET.x + (radius * 0.6) / width,
        y: THROW_TARGET.y + (radius * 0.6) / height,
      },
      width,
      height,
    ),
    true,
  );
});

test("aim geometry follows the same pixel circle when the scene resizes between portrait and landscape", () => {
  for (const [width, height] of [
    [320, 370],
    [740, 230],
    [400, 320],
  ]) {
    const radius = Math.min(width * 0.125, height * 0.105);
    assert.equal(captureThrowHits(THROW_TARGET, width, height), true);
    assert.equal(
      captureThrowHits(
        { x: THROW_TARGET.x + (radius * 0.8) / width, y: THROW_TARGET.y },
        width,
        height,
      ),
      true,
    );
    assert.equal(
      captureThrowHits(
        { x: THROW_TARGET.x + (radius * 1.2) / width, y: THROW_TARGET.y },
        width,
        height,
      ),
      false,
    );
  }
});

test("aim geometry rejects nonfinite coordinates and missing or nonpositive scene sizes", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(
      captureThrowHits({ x: value, y: THROW_TARGET.y }, 400, 320),
      false,
    );
    assert.equal(
      captureThrowHits({ x: THROW_TARGET.x, y: value }, 400, 320),
      false,
    );
    assert.equal(captureThrowHits(THROW_TARGET, value, 320), false);
    assert.equal(captureThrowHits(THROW_TARGET, 400, value), false);
  }
  for (const value of [0, -1]) {
    assert.equal(captureThrowHits(THROW_TARGET, value, 320), false);
    assert.equal(captureThrowHits(THROW_TARGET, 400, value), false);
  }
});

test("slingshot origin sits above the bottom and the launch reverses direction with threefold power", () => {
  assert.deepEqual(THROW_ORIGIN, { x: 0.5, y: 0.7 });
  assert.deepEqual(THROW_TARGET, { x: 0.5, y: 0.3 });
  const landing = captureSlingshotLanding({
    x: THROW_ORIGIN.x + 0.06,
    y: THROW_ORIGIN.y + 0.08,
  });
  assert(Math.abs(landing.x - (THROW_ORIGIN.x - 0.18)) < 1e-12);
  assert(Math.abs(landing.y - (THROW_ORIGIN.y - 0.24)) < 1e-12);
});

test("a zero-length slingshot pull stays at the origin and cannot hit the target", () => {
  const landing = captureSlingshotLanding(THROW_ORIGIN);
  assert.deepEqual(landing, THROW_ORIGIN);
  assert.equal(captureThrowHits(landing, 400, 320), false);
});

test("pulling one third of the target distance backwards lands at its center across scene sizes", () => {
  const pull = {
    x: THROW_ORIGIN.x + (THROW_ORIGIN.x - THROW_TARGET.x) / 3,
    y: THROW_ORIGIN.y + (THROW_ORIGIN.y - THROW_TARGET.y) / 3,
  };
  const landing = captureSlingshotLanding(pull);
  assert(Math.abs(landing.x - THROW_TARGET.x) < 1e-12);
  assert(Math.abs(landing.y - THROW_TARGET.y) < 1e-12);
  for (const [width, height] of [
    [320, 370],
    [740, 230],
    [400, 320],
  ])
    assert.equal(captureThrowHits(landing, width, height), true);
});

test("the old direct drag onto the target now shoots in the wrong direction and misses", () => {
  const landing = captureSlingshotLanding(THROW_TARGET);
  assert(
    landing.y > 1,
    "the landing remains beyond the scene instead of clamping to an edge",
  );
  assert.equal(captureThrowHits(landing, 400, 320), false);
});

test("an excessive slingshot pull overshoots without clamping magnitude or landing coordinates", () => {
  const landing = captureSlingshotLanding({
    x: THROW_ORIGIN.x + 0.3,
    y: THROW_ORIGIN.y + 0.5,
  });
  assert(Math.abs(landing.x + 0.4) < 1e-12);
  assert(Math.abs(landing.y + 0.8) < 1e-12);
  assert.equal(captureThrowHits(landing, 400, 320), false);
});
