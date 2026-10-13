import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  executePokemonMove,
  type PartyState,
} from "../src/slices/partySlice";
import {
  battleContextKey,
  criticalChance,
  requiresConditionCheck,
} from "../src/lib/battleEngine";
import {
  CURATED_MOVE_CATALOG as catalog,
  NUMERIC_MOVE_INPUTS,
  getCuratedMove,
} from "../src/lib/curatedMoveCatalog";
import {
  createLeveledPokemon,
  neutralBattleStages,
  getMaxHp,
} from "../src/lib/pokemonStats";
import { typeEffectiveness } from "../src/lib/typeEffectiveness";
import type { LearnedMove } from "../src/types/moves";
import type { MoveExecutionOptions } from "../src/lib/moveCatalogTypes";
function move(id: number): LearnedMove {
  const e = catalog[id];
  return {
    id,
    name: e.name,
    displayName: e.name,
    description: "old",
    ...e.parameters,
    source: "wild",
  };
}
function pokemon(name: string) {
  return createLeveledPokemon({
    id: 96,
    name,
    types: ["normal"],
    image: null,
    stats: [
      "hp",
      "attack",
      "defense",
      "special-attack",
      "special-defense",
      "speed",
    ].map((name) => ({ name, value: 300 })),
  });
}
function fixture(id: number): PartyState {
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: [
      {
        captureId: "own",
        pokemon: pokemon("Own"),
        statuses: [],
        moves: [move(id)],
      },
    ],
    opponent: {
      kind: "wild",
      encounterId: "wild",
      pokemon: pokemon("Wild"),
      stages: neutralBattleStages(),
      statuses: [],
      moves: [move(id)],
    },
  };
}
function execute(
  s: PartyState,
  id: number,
  side: "player" | "opponent" = "player",
  options: MoveExecutionOptions = {},
  roll = 0.5,
  extra: number[] = Array(64).fill(0.99),
) {
  const action = executePokemonMove({
    captureId: "own",
    moveId: id,
    actorSide: side,
    commandId: `test-${s.resolvedBattleIds?.length ?? 0}`,
    expectedContext: battleContextKey(
      s.pokemons[0],
      s.opponent!,
      s.battleField,
    ),
    conditionsConfirmed: true,
    options,
  });
  action.payload.rolls = { accuracy: roll, critical: 0.99, extra };
  return { next: reducer(s, action), action };
}
const hp = (s: PartyState) => [
  s.pokemons[0].pokemon.stats[0].value,
  s.opponent!.pokemon.stats[0].value,
];

import {
  emptyBattleField,
  activateMoveField,
  fieldPowerMultiplier,
  weatherResidual,
} from "../src/lib/battleField";
import {
  finishBattleTurn,
  activateBattlePokemon,
  changeOpponentHp,
  setBattleOpponent,
  resetGame,
} from "../src/slices/partySlice";
import { describePartyActivity } from "../src/lib/partyActivity";
function withWeather(id: number, kind: "sun" | "rain" | "sand" | "hail") {
  const s = fixture(id);
  s.battleField = { ...emptyBattleField(), weather: { kind, turnsLeft: 5 } };
  return s;
}
function end(s: PartyState) {
  const action = finishBattleTurn({
    captureId: "own",
    expectedTurn: s.battleField!.turn,
    expectedContext: battleContextKey(
      s.pokemons[0],
      s.opponent!,
      s.battleField,
    ),
  });
  return { next: reducer(s, action), action };
}
for (const [id, kind] of [
  [241, "sun"],
  [240, "rain"],
  [201, "sand"],
  [258, "hail"],
] as const)
  for (const side of ["player", "opponent"] as const) {
    test(`${kind} activation by ${side}, persistence and duplicate failure`, () => {
      let { next } = execute(fixture(id), id, side);
      assert.equal(next.lastBattleResult?.outcome, "status");
      assert.deepEqual(next.battleField?.weather, { kind, turnsLeft: 5 });
      next = JSON.parse(JSON.stringify(next));
      const duplicate = execute(next, id, side).next;
      assert.equal(duplicate.lastBattleResult?.outcome, "miss");
      assert.deepEqual(
        duplicate.battleField?.weather,
        next.battleField?.weather,
      );
    });
  }
test("sun replaces rain and lasts exactly five completed turns", () => {
  let s = execute(withWeather(241, "rain"), 241).next;
  assert.equal(s.battleField?.weather?.kind, "sun");
  for (let i = 4; i >= 0; i--) {
    const { next, action } = end(s);
    assert.equal(next.battleField?.weather?.turnsLeft ?? 0, i);
    assert.deepEqual(reducer(next, action), next);
    s = next;
  }
  assert.equal(s.battleField?.turn, 6);
});
test("sand residual, immunities and logged end turn", () => {
  const s = withWeather(33, "sand");
  s.opponent!.pokemon.types = ["rock"];
  s.pokemons[0].statuses = ["flinched"];
  s.opponent!.statuses = ["flinched"];
  const { next, action } = end(s);
  assert.equal(
    hp(next)[0],
    hp(s)[0] - Math.floor(getMaxHp(s.pokemons[0].pokemon)! / 16),
  );
  assert.equal(hp(next)[1], hp(s)[1]);
  assert.deepEqual(next.pokemons[0].statuses, []);
  assert.deepEqual(next.opponent!.statuses, []);
  assert.ok(describePartyActivity(action.type, s, next)?.details.length);
});
test("hail residual caps damage to remaining HP and exempts Ice", () => {
  const s = withWeather(33, "hail");
  s.pokemons[0].pokemon.stats[0].value = 1;
  s.opponent!.pokemon.types = ["ice"];
  const { next } = end(s);
  assert.equal(hp(next)[0], 0);
  assert.equal(hp(next)[1], hp(s)[1]);
});
test("authoritative weather changes damage and ignores submitted weather", () => {
  const normal = execute(fixture(53), 53).next.lastBattleResult!;
  const sun = execute(withWeather(53, "sun"), 53, "player", { weather: "rain" })
    .next.lastBattleResult!;
  assert.equal(sun.weatherMultiplier, 1.5);
  assert.ok(sun.damage > normal.damage);
  const rain = execute(withWeather(53, "rain"), 53).next.lastBattleResult!;
  assert.equal(rain.weatherMultiplier, 0.5);
  assert.ok(rain.damage < normal.damage);
});
test("rain guarantees Thunder, sun lowers accuracy", () => {
  assert.equal(
    execute(withWeather(87, "rain"), 87, "player", {}, 0.99).next
      .lastBattleResult?.outcome,
    "hit",
  );
  assert.equal(
    execute(withWeather(87, "sun"), 87, "player", {}, 0.75).next
      .lastBattleResult?.outcome,
    "miss",
  );
});
test("sun waives Solar Beam preparation, rain does not", () => {
  assert.equal(
    execute(withWeather(76, "sun"), 76).next.lastBattleResult?.outcome,
    "hit",
  );
  assert.equal(
    execute(withWeather(76, "rain"), 76).next.lastBattleResult?.outcome,
    "blocked",
  );
});
test("Weather Ball reads field and changes type", () => {
  const result = execute(withWeather(311, "rain"), 311).next.lastBattleResult!;
  assert.equal(result.outcome, "hit");
  assert.equal(result.weatherMultiplier, 1.5);
  assert.equal(result.executionOptions?.weather, "rain");
});
test("Morning Sun reads current weather to heal", () => {
  for (const [weather, fraction] of [
    ["sun", 2 / 3],
    ["rain", 1 / 4],
  ] as const) {
    const s = withWeather(234, weather);
    s.pokemons[0].pokemon.stats[0].value = 1;
    const next = execute(s, 234).next;
    assert.equal(
      hp(next)[0],
      1 + Math.floor(getMaxHp(s.pokemons[0].pokemon)! * fraction),
    );
  }
});
for (const [id, property, type] of [
  [300, "mudSport", "electric"],
  [346, "waterSport", "fire"],
] as const)
  test(`${property} activates and clears on source switch`, () => {
    let s = execute(fixture(id), id).next;
    assert.equal(s.battleField![property]?.[0]?.side, "player");
    assert.equal(fieldPowerMultiplier(s.battleField!, type), 0.5);
    s = {
      ...s,
      pokemons: [...s.pokemons, { ...s.pokemons[0], captureId: "second" }],
    };
    s = reducer(s, activateBattlePokemon("second"));
    assert.equal(s.battleField![property], null);
  });
test("rival sport survives player switch; HP dialog fainting clears source", () => {
  let s = execute(fixture(346), 346, "opponent").next;
  s = {
    ...s,
    pokemons: [...s.pokemons, { ...s.pokemons[0], captureId: "second" }],
  };
  s = reducer(s, activateBattlePokemon("second"));
  assert.ok(s.battleField?.waterSport);
  s = reducer(
    s,
    changeOpponentHp({
      amount: -9999,
      expectedOpponent: JSON.stringify(["wild", 96, "wild"]),
    }),
  );
  assert.equal(hp(s)[1], 0);
  assert.equal(s.battleField?.waterSport, null);
});
test("field affects attack power in addition to weather", () => {
  const s = withWeather(53, "sun");
  s.battleField!.waterSport = [{ side: "opponent" }];
  const result = execute(s, 53).next.lastBattleResult!;
  const plain = execute(withWeather(53, "sun"), 53).next.lastBattleResult!;
  assert.ok(result.damage < plain.damage);
  assert.ok(result.effectMessages?.some((x) => x.includes("×0.5")));
});
test("same opponent edits preserve field; remove and reset clear it", () => {
  let s = withWeather(33, "sun");
  s = reducer(s, setBattleOpponent({ ...s.opponent! }));
  assert.equal(s.battleField?.weather?.kind, "sun");
  assert.equal(reducer(s, setBattleOpponent(null)).battleField?.weather, null);
  assert.equal(reducer(s, resetGame()).battleField?.weather, null);
});
test("HP edits guard opponent identity, clamp max and log", () => {
  const s = fixture(33);
  const bad = changeOpponentHp({ amount: -10, expectedOpponent: "wrong" });
  assert.deepEqual(reducer(s, bad), s);
  const a = changeOpponentHp({
    amount: -10,
    expectedOpponent: JSON.stringify(["wild", 96, "wild"]),
  });
  const next = reducer(s, a);
  assert.equal(hp(next)[1], hp(s)[1] - 10);
  assert.equal(describePartyActivity(a.type, s, next)?.kind, "hp");
  assert.equal(
    hp(reducer(next, changeOpponentHp({ ...a.payload, amount: 99999 })))[1],
    getMaxHp(s.opponent!.pokemon),
  );
});
test("field change rejects stale attack context", () => {
  const s = fixture(33);
  const action = execute(s, 33).action;
  const changed = withWeather(33, "rain");
  assert.deepEqual(reducer(changed, action), changed);
});
test("old saved party without field still executes", () => {
  const s = fixture(33);
  delete s.battleField;
  assert.equal(execute(s, 33).next.lastBattleResult?.outcome, "hit");
});
test("Dream Eater still drains actual damage", () => {
  const s = fixture(138);
  s.opponent!.statuses = ["asleep"];
  s.opponent!.pokemon.stats[0].value = 10;
  s.pokemons[0].pokemon.stats[0].value = 20;
  const next = execute(s, 138).next;
  assert.equal(hp(next)[1], 0);
  assert.equal(hp(next)[0], 25);
});
test("Sleep Talk can activate selected weather without direct selection", () => {
  const s = fixture(214);
  s.pokemons[0].statuses = ["asleep"];
  s.pokemons[0].moves = [move(214), move(240)];
  const next = execute(
    s,
    214,
    "player",
    { targetHasActed: false },
    0.1,
    Array(64).fill(0),
  ).next;
  assert.equal(next.lastBattleResult?.resolvedMoveId, 240);
  assert.equal(next.battleField?.weather?.kind, "rain");
});
test("turn completion keeps a timestamped activity entry", () => {
  const s = withWeather(33, "sand");
  const { next } = end(s);
  assert.equal(next.activityHistory?.[0]?.kind, "move");
});

test("each combatant can supply sport; repeat from same source fails", () => {
  let s = execute(fixture(346), 346).next;
  s = execute(s, 346, "opponent").next;
  assert.equal(s.lastBattleResult?.outcome, "status");
  assert.equal(s.battleField?.waterSport?.length, 2);
  assert.equal(fieldPowerMultiplier(s.battleField!, "fire"), 0.25);
  s = execute(s, 346, "opponent").next;
  assert.equal(s.lastBattleResult?.outcome, "miss");
});
