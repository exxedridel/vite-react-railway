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
  if (options.weather)
    s = {
      ...s,
      battleField: {
        version: 1,
        turn: 1,
        activeCaptureId: null,
        mudSport: null,
        waterSport: null,
        weather:
          options.weather === "none"
            ? null
            : { kind: options.weather, turnsLeft: 5 },
      },
    };
  const action = executePokemonMove({
    captureId: "own",
    moveId: id,
    actorSide: side,
    commandId: "test",
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
test("354 unique entries and historical values/categories", () => {
  assert.equal(Object.keys(catalog).length, 354);
  assert.equal(move(173).power, 40);
  assert.equal(move(91).power, 60);
  assert.equal(move(19).power, 70);
  assert.equal(move(53).power, 95);
  assert.equal(move(247).damageClass, "physical");
  assert.equal(move(44).damageClass, "special");
  assert.equal(typeEffectiveness("ghost", ["steel"]), 0.5);
  assert.equal(typeEffectiveness("dark", ["steel"]), 0.5);
  assert.equal(criticalChance(move(33)), 1 / 16);
});
for (const id of [173, 214])
  test(`${id}: asleep required; awake fails with log`, () => {
    const s = fixture(id),
      n = execute(s, id).next;
    assert.equal(n.lastBattleResult!.outcome, "miss");
    assert.deepEqual(hp(s), hp(n));
    assert.equal(n.activityHistory!.length, 1);
  });
test("Snore asleep damages and applies 30% flinch before target acts", () => {
  const s = fixture(173);
  s.pokemons[0].statuses = ["asleep"];
  const extra = Array(64).fill(0.99);
  extra[30] = 0.299;
  const n = execute(s, 173, "player", { targetHasActed: false }, 0, extra).next;
  assert.equal(n.lastBattleResult!.outcome, "hit");
  assert.ok(n.opponent!.statuses!.includes("flinched"));
  assert.deepEqual(n.pokemons[0].statuses, ["asleep"]);
  assert.equal(requiresConditionCheck(s.pokemons[0], 173), false);
});
for (const acted of [true, undefined])
  test(`flinch not applied when acted=${acted}`, () => {
    const s = fixture(173);
    s.pokemons[0].statuses = ["asleep"];
    const n = execute(
      s,
      173,
      "player",
      { targetHasActed: acted },
      0,
      Array(64).fill(0),
    ).next;
    assert.ok(!n.opponent!.statuses!.includes("flinched"));
  });
test("flinch boundary at 30 percent fails", () => {
  const s = fixture(173);
  s.pokemons[0].statuses = ["asleep"];
  const extra = Array(64).fill(0.3);
  const n = execute(s, 173, "player", { targetHasActed: false }, 0, extra).next;
  assert.ok(!n.opponent!.statuses!.includes("flinched"));
});
test("Sleep Talk executes learned attack and logs selected move", () => {
  const s = fixture(214);
  s.pokemons[0].statuses = ["asleep"];
  s.pokemons[0].moves!.push(move(33));
  const n = execute(s, 214).next;
  assert.equal(n.lastBattleResult!.resolvedMoveId, 33);
  assert.equal(n.lastBattleResult!.moveId, 214);
  assert.ok(hp(n)[1] < hp(s)[1]);
  assert.match(n.lastBattleResult!.moveName, /Sleep Talk → Tackle/);
  assert.equal(n.activityHistory!.length, 1);
});
test("Sleep Talk excludes all forbidden moves and fails without candidate", () => {
  const s = fixture(214);
  s.pokemons[0].statuses = ["asleep"];
  s.pokemons[0].moves!.push(move(19), move(76), move(117));
  const n = execute(s, 214).next;
  assert.equal(n.lastBattleResult!.outcome, "miss");
  assert.deepEqual(hp(n), hp(s));
});
test("Sleep Talk wild actor uses its own moves and states", () => {
  const s = fixture(214);
  s.opponent!.statuses = ["asleep"];
  s.opponent!.moves!.push(move(33));
  const n = execute(s, 214, "opponent").next;
  assert.equal(n.lastBattleResult!.resolvedMoveId, 33);
  assert.ok(hp(n)[0] < hp(s)[0]);
});
for (const id of [13, 19, 76, 91, 130, 143, 291, 340])
  test(`preparation required for ${id}`, () => {
    const s = fixture(id);
    assert.equal(execute(s, id).next.lastBattleResult!.outcome, "blocked");
    const n = execute(
      s,
      id,
      "player",
      { preparationConfirmed: true, targetHasActed: false },
      0,
    ).next;
    assert.equal(n.lastBattleResult!.outcome, "hit");
    assert.ok(hp(n)[1] < hp(s)[1]);
  });
test("Solar Beam no preparation under sun and half damage in rain", () => {
  const s = fixture(76);
  const sun = execute(s, 76, "player", { weather: "sun" }, 0).next;
  assert.equal(sun.lastBattleResult!.outcome, "hit");
  const plain = execute(
    s,
    76,
    "player",
    { weather: "none", preparationConfirmed: true },
    0,
  ).next;
  const rain = execute(
    s,
    76,
    "player",
    { weather: "rain", preparationConfirmed: true },
    0,
  ).next;
  assert.equal(
    rain.lastBattleResult!.damage,
    Math.floor(plain.lastBattleResult!.damage / 2),
  );
});
test("Dream Eater overkill: actual 10 damage heals 5", () => {
  const s = fixture(138);
  s.opponent!.statuses = ["asleep"];
  s.opponent!.pokemon.stats[0].value = 10;
  s.pokemons[0].pokemon.stats[0].value = 20;
  const n = execute(s, 138).next;
  assert.deepEqual(hp(n), [25, 0]);
  assert.equal(n.lastBattleResult!.appliedHealing, 5);
});
test("Dream Eater reverse direction sees own Asleep", () => {
  const s = fixture(138);
  s.pokemons[0].statuses = ["asleep"];
  s.pokemons[0].pokemon.stats[0].value = 10;
  s.opponent!.pokemon.stats[0].value = 20;
  const n = execute(s, 138, "opponent").next;
  assert.deepEqual(hp(n), [0, 25]);
});
test("drain cannot overheal", () => {
  const s = fixture(71);
  const n = execute(s, 71).next;
  assert.equal(n.lastBattleResult!.appliedHealing, 0);
  assert.equal(hp(n)[0], getMaxHp(s.pokemons[0].pokemon));
});
test("burn chance applies and does not overwrite existing poison", () => {
  for (const poisoned of [true, false]) {
    const s = fixture(53);
    s.opponent!.statuses = poisoned ? ["poisoned"] : [];
    const n = execute(s, 53, "player", {}, 0, Array(64).fill(0)).next;
    assert.deepEqual(
      n.opponent!.statuses,
      poisoned ? ["poisoned"] : ["burned"],
    );
  }
});
test("Gen 3: Electric paralysis and Grass powder allowed", () => {
  for (const [id, type, status] of [
    [86, "electric", "paralyzed"],
    [79, "grass", "asleep"],
  ] as const) {
    const s = fixture(id);
    s.opponent!.pokemon.types = [type];
    const n = execute(s, id, "player", {}, 0).next;
    assert.ok(n.opponent!.statuses!.includes(status));
  }
});
test("Thunder Wave fails against Ground", () => {
  const s = fixture(86);
  s.opponent!.pokemon.types = ["ground"];
  const n = execute(s, 86, "player", {}, 0).next;
  assert.equal(n.lastBattleResult!.outcome, "immune");
  assert.deepEqual(n.opponent!.statuses, []);
});
test("Swords Dance and Overheat update correct stages", () => {
  const s = fixture(14);
  assert.equal(execute(s, 14).next.pokemons[0].pokemon.battleStages!.attack, 2);
  const n = execute(fixture(315), 315, "opponent", {}, 0).next;
  assert.equal(n.opponent!.stages["special-attack"], -2);
});
test("stage clamp +6", () => {
  const s = fixture(14);
  s.pokemons[0].pokemon.battleStages!.attack = 5;
  assert.equal(execute(s, 14).next.pokemons[0].pokemon.battleStages!.attack, 6);
});
test("Rest cures primary status and heals but retains confusion", () => {
  const s = fixture(156);
  s.pokemons[0].statuses = ["burned", "confused"];
  s.pokemons[0].pokemon.stats[0].value = 10;
  const n = execute(s, 156).next;
  assert.equal(hp(n)[0], getMaxHp(n.pokemons[0].pokemon));
  assert.deepEqual(n.pokemons[0].statuses, ["confused", "asleep"]);
});
test("Rest fails at full HP", () => {
  const s = fixture(156);
  assert.equal(execute(s, 156).next.lastBattleResult!.outcome, "miss");
});
test("False Swipe leaves 1 HP", () => {
  const s = fixture(206);
  s.opponent!.pokemon.stats[0].value = 2;
  assert.equal(hp(execute(s, 206).next)[1], 1);
});
test("multi-hit calculates multiple hits", () => {
  const n = execute(fixture(24), 24).next;
  assert.equal(n.lastBattleResult!.hits!.length, 2);
  assert.equal(
    n.lastBattleResult!.damage,
    n.lastBattleResult!.hits!.reduce((a, h) => a + h.damage, 0),
  );
});
test("2–5 hits distribution boundaries", () => {
  for (const [roll, count] of [
    [0, 2],
    [0.374, 2],
    [0.375, 3],
    [0.75, 4],
    [0.875, 5],
  ]) {
    const extra = Array(64).fill(0.99);
    extra[2] = roll;
    const n = execute(fixture(3), 3, "player", {}, 0, extra).next;
    assert.equal(n.lastBattleResult!.hits!.length, count);
  }
});
test("recoil applies from actual damage", () => {
  const s = fixture(38);
  s.opponent!.pokemon.stats[0].value = 9;
  const n = execute(s, 38).next;
  assert.equal(hp(n)[0], hp(s)[0] - 3);
});
test("Self-Destruct faints even against immune Ghost", () => {
  const s = fixture(120);
  s.opponent!.pokemon.types = ["ghost"];
  const n = execute(s, 120).next;
  assert.equal(n.lastBattleResult!.outcome, "immune");
  assert.equal(hp(n)[0], 0);
  assert.equal(hp(n)[1], hp(s)[1]);
});
test("Jump Kick crash on miss, not Ghost immunity", () => {
  const s = fixture(26);
  const n = execute(s, 26, "player", {}, 0.99).next;
  assert.equal(n.lastBattleResult!.outcome, "miss");
  assert.ok(hp(n)[0] < hp(s)[0]);
  assert.equal(hp(n)[1], hp(s)[1]);
  s.opponent!.pokemon.types = ["ghost"];
  assert.equal(hp(execute(s, 26).next)[0], hp(s)[0]);
});
test("fixed damage ignores STAB and defenses", () => {
  for (const [id, damage] of [
    [49, 20],
    [82, 40],
    [69, 50],
    [101, 50],
  ]) {
    const s = fixture(id);
    s.opponent!.pokemon.types = ["water"];
    assert.equal(
      execute(s, id, "player", {}, 0).next.lastBattleResult!.damage,
      damage,
    );
  }
});
test("Present healing updates target not attacker", () => {
  const s = fixture(217);
  s.opponent!.pokemon.stats[0].value = 1;
  const n = execute(s, 217, "player", {}, 0).next;
  assert.equal(n.lastBattleResult!.outcome, "status");
  assert.equal(hp(n)[1], 1 + Math.floor(getMaxHp(s.opponent!.pokemon)! / 4));
  assert.equal(hp(n)[0], hp(s)[0]);
});
test("duplicate and changed target rejected", () => {
  const s = fixture(33),
    { next, action } = execute(s, 33);
  assert.equal(reducer(next, action), next);
  const altered = structuredClone(s);
  altered.opponent!.statuses = ["asleep"];
  assert.equal(reducer(altered, action), altered);
});
test("manual effects never invent damage", () => {
  const s = fixture(248),
    n = execute(s, 248).next;
  assert.equal(n.lastBattleResult!.outcome, "manual");
  assert.deepEqual(hp(n), hp(s));
});
// Every catalog entry must resolve deterministically with valid declared context in both directions.
for (const e of Object.values(catalog))
  for (const side of ["player", "opponent"] as const)
    test(`catalog ${e.id} ${e.name} ${side}`, () => {
      const s = fixture(e.id),
        attacker = side === "player" ? s.pokemons[0] : s.opponent!,
        target = side === "player" ? s.opponent! : s.pokemons[0];
      attacker.pokemon.stats[0].value = 250;
      target.pokemon.stats[0].value = 400;
      if (e.sleepOnly) attacker.statuses = ["asleep"];
      if (e.targetSleepOnly) target.statuses = ["asleep"];
      if (e.id === 214) attacker.moves!.push(move(33));
      const n = execute(
        s,
        e.id,
        side,
        {
          preparationConfirmed: true,
          specialConditionConfirmed: true,
          targetHasActed: false,
          numericValue: NUMERIC_MOVE_INPUTS[e.id]?.min,
          weather: "none",
        },
        0,
      ).next;
      assert.ok(n.lastBattleResult);
      assert.equal(n.activityHistory!.length, 1);
      if (e.automation === "manual")
        assert.equal(n.lastBattleResult!.outcome, "manual");
      else
        assert.ok(
          ["hit", "status", "miss", "immune"].includes(
            n.lastBattleResult!.outcome,
          ),
          n.lastBattleResult!.message,
        );
      for (const p of [n.pokemons[0].pokemon, n.opponent!.pokemon]) {
        assert.ok(Number.isSafeInteger(p.stats[0].value));
        assert.ok(p.stats[0].value >= 0 && p.stats[0].value <= getMaxHp(p)!);
      }
    });
test("historical removals: Waterfall/Volt Tackle/Rapid Spin/Charge", () => {
  assert.equal(catalog[127].effects.length, 0);
  assert.equal(catalog[344].effects.length, 0);
  assert.equal(catalog[229].effects.length, 0);
  assert.equal(catalog[268].automation, "manual");
  const n = execute(fixture(229), 229).next;
  assert.equal(n.pokemons[0].pokemon.battleStages!.speed, 0);
});
test("Pursuit switching bonus doubles power and ignores evasion", () => {
  const s = fixture(228);
  s.opponent!.stages.evasiveness = 6;
  const plain = execute(s, 228, "player", {}, 0.99).next;
  assert.equal(plain.lastBattleResult!.outcome, "miss");
  const bonus = execute(
    s,
    228,
    "player",
    { powerBoostConfirmed: true },
    0.99,
  ).next;
  assert.equal(bonus.lastBattleResult!.outcome, "hit");
  assert.equal(bonus.lastBattleResult!.hitChance, 100);
});
test("Memento fails entirely at -6 attack and special attack", () => {
  const s = fixture(262);
  s.opponent!.stages.attack = -6;
  s.opponent!.stages["special-attack"] = -6;
  const n = execute(s, 262).next;
  assert.equal(n.lastBattleResult!.outcome, "miss");
  assert.deepEqual(hp(n), hp(s));
});
test("Fire damage thaws target", () => {
  const s = fixture(53);
  s.opponent!.statuses = ["frozen"];
  const n = execute(s, 53, "player", {}, 0).next;
  assert.ok(!n.opponent!.statuses!.includes("frozen"));
});
test("Heal Bell heals primary conditions of own entire party, not confusion", () => {
  const s = fixture(215);
  s.pokemons[0].statuses = ["burned"];
  s.pokemons.push({
    ...structuredClone(s.pokemons[0]),
    captureId: "second",
    statuses: ["poisoned", "confused"],
  });
  const n = execute(s, 215).next;
  assert.deepEqual(n.pokemons[0].statuses, []);
  assert.deepEqual(n.pokemons[1].statuses, ["confused"]);
});
test("Sleep Talk does not silently reroll manual moves", () => {
  const s = fixture(214);
  s.pokemons[0].statuses = ["asleep"];
  s.pokemons[0].moves!.push(move(248));
  const n = execute(s, 214).next;
  assert.equal(n.lastBattleResult!.resolvedMoveId, 248);
  assert.equal(n.lastBattleResult!.outcome, "manual");
  assert.deepEqual(hp(n), hp(s));
});
