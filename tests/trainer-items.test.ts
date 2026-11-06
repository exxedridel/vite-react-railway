import assert from "node:assert/strict";
import { test } from "node:test";
import { Battle } from "@pkmn/sim";
import { trainerSpecies, trainerMoves } from "../src/lib/trainerBattle/catalog";
import {
  startTrainerBattle,
  chooseTrainerAction,
  cancelTrainerAction,
} from "../src/lib/trainerBattle/engine";
import {
  createTrainerBattleSession,
  validTrainerBattleSession,
} from "../src/lib/trainerBattle/model";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import type {
  TrainerBattleSession,
  TrainerChoice,
  TrainerPokemon,
  TrainerSide,
} from "../src/lib/trainerBattle/types";

const seed: [number, number, number, number] = [1, 2, 3, 4];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function member(
  id: string,
  speciesId: number,
  moveIds = [33, 150],
): TrainerPokemon {
  const species = trainerSpecies.find(
    (candidate) => candidate.id === speciesId,
  )!;
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
    moves: moveIds.map((moveId) =>
      clone(trainerMoves.find((move) => move.id === moveId)!),
    ),
    statuses: [],
    statusTurns: {},
  };
}
function fixture(aMoves = [33, 150], bMoves = [33, 150]) {
  const session = createTrainerBattleSession();
  session.id = "trainer-item-regression";
  session.teams.a = {
    name: "Ana",
    activeCaptureId: "a0",
    pokemons: [member("a0", 143, aMoves), member("a1", 242)],
  };
  session.teams.b = {
    name: "Bruno",
    activeCaptureId: "b0",
    pokemons: [member("b0", 143, bMoves), member("b1", 242)],
  };
  return session;
}
function choose(
  session: TrainerBattleSession,
  side: TrainerSide,
  choice: number | TrainerChoice,
) {
  return chooseTrainerAction(
    session,
    side,
    typeof choice === "number" ? { kind: "move", moveId: choice } : choice,
  );
}
function turn(
  session: TrainerBattleSession,
  a: number | TrainerChoice,
  b: number | TrainerChoice,
) {
  return choose(choose(session, "a", a), "b", b);
}
function item(captureId: string): TrainerChoice {
  return { kind: "item", item: "full-restore", captureId };
}
function hp(session: TrainerBattleSession, side: TrainerSide, index = 0) {
  return getCurrentHp(session.teams[side].pokemons[index].pokemon);
}
function battle(session: TrainerBattleSession) {
  return Battle.fromJSON(session.runtime!.engine);
}
function hurt(capture: TrainerPokemon, amount = 50) {
  capture.pokemon.stats.find((stat) => stat.name === "hp")!.value = amount;
  capture.statuses = ["poisoned", "confused"];
  capture.statusTurns = { confused: 3 };
  capture.pokemon.battleStages = {
    attack: 3,
    defense: -2,
    "special-attack": 4,
    "special-defense": -5,
    speed: 6,
    accuracy: -1,
    evasiveness: 2,
  };
}

for (const side of ["a", "b"] as const)
  for (const target of [0, 1]) {
    test(`${side} Full restore on ${target === 0 ? "active" : "reserve"} stays private and inert until resolution, survives reload and cancels`, () => {
      const setup = fixture();
      hurt(setup.teams[side].pokemons[target]);
      const started = startTrainerBattle(setup, seed);
      const before = JSON.stringify(started);
      const queued = choose(started, side, item(`${side}${target}`));
      assert.equal(JSON.stringify(started), before);
      assert.deepEqual(queued.teams, started.teams);
      assert.deepEqual(queued.history, started.history);
      assert.equal(queued.runtime!.turn, started.runtime!.turn);
      assert.deepEqual(queued.runtime!.requests, started.runtime!.requests);
      assert.deepEqual(
        battle(queued).prng.getSeed(),
        battle(started).prng.getSeed(),
      );
      assert.deepEqual(queued.runtime!.pending[side], item(`${side}${target}`));
      assert(validTrainerBattleSession(queued));
      assert.throws(() => choose(queued, side, 33), /ya eligió/);
      const cancelled = cancelTrainerAction(clone(queued), side);
      assert.deepEqual(cancelled.teams, started.teams);
      assert.deepEqual(cancelled.runtime!.pending, {});
      assert.deepEqual(cancelled.history, []);
      assert.deepEqual(
        battle(cancelled).prng.getSeed(),
        battle(started).prng.getSeed(),
      );
      const other = side === "a" ? "b" : "a";
      const direct = choose(queued, other, 150);
      const restored = choose(clone(queued), other, 150);
      assert.deepEqual(restored, direct);
      const healed = restored.teams[side].pokemons[target];
      assert.equal(getCurrentHp(healed.pokemon), getMaxHp(healed.pokemon));
      assert.deepEqual(healed.statuses, []);
      assert.deepEqual(healed.statusTurns, {});
      assert.deepEqual(healed.pokemon.battleStages, neutralBattleStages());
      assert.equal(restored.runtime!.turn, 2);
      assert.equal(restored.history.length, 1);
      assert(
        !restored.history[0].results.some(
          (result) =>
            result.actorSide === (side === "a" ? "player" : "opponent"),
        ),
      );
      assert(
        restored.history[0].events.some((event) =>
          event.includes("usó Full restore"),
        ),
      );
      assert(
        restored.history[0].highlights.some((event) =>
          event.includes("usó Full restore"),
        ),
      );
      assert(validTrainerBattleSession(restored));
    });
  }

for (const side of ["a", "b"] as const) {
  test(`${side} trainer item ignores all action-blocking statuses and clears all seven boosts without PP use`, () => {
    const setup = fixture();
    const target = setup.teams[side].pokemons[0];
    hurt(target);
    target.statuses = [
      "asleep",
      "confused",
      "infatuated",
      "taunted",
      "tormented",
      "flinched",
      "bound",
      "trapped",
      "disabled",
      "encored",
      "perish-song",
      "leech-seed",
    ];
    target.statusTurns = {
      asleep: 4,
      confused: 3,
      taunted: 2,
      bound: 3,
      disabled: 3,
      encored: 4,
      "perish-song": 1,
    };
    target.trainerStatusContext = {
      gender: "M",
      disabledMoveId: 33,
      encoredMoveId: 150,
    };
    setup.teams[side === "a" ? "b" : "a"].pokemons[0].trainerStatusContext = {
      gender: "F",
    };
    const started = startTrainerBattle(setup, seed);
    const before = side === "a" ? battle(started).p1 : battle(started).p2;
    const result =
      side === "a"
        ? turn(started, item("a0"), 150)
        : turn(started, 150, item("b0"));
    const healed = result.teams[side].pokemons[0];
    assert.equal(getCurrentHp(healed.pokemon), getMaxHp(healed.pokemon));
    assert.deepEqual(healed.statuses, []);
    assert.deepEqual(healed.statusTurns, {});
    assert.deepEqual(healed.pokemon.battleStages, neutralBattleStages());
    const after = side === "a" ? battle(result).p1 : battle(result).p2;
    assert.deepEqual(
      after.active[0].moveSlots.map((move) => move.pp),
      before.active[0].moveSlots.map((move) => move.pp),
    );
    assert(validTrainerBattleSession(result));
  });

  test(`${side} trainer item revives only its own fainted reserve and updates legal replacements`, () => {
    const setup = fixture();
    hurt(setup.teams[side].pokemons[1], 0);
    const started = startTrainerBattle(setup, seed);
    const beforeActive = clone(started.teams[side].pokemons[0]);
    const result =
      side === "a"
        ? turn(started, item("a1"), 150)
        : turn(started, 150, item("b1"));
    const simulated = side === "a" ? battle(result).p1 : battle(result).p2;
    const reserve = simulated.pokemon.find(
      (pokemon) => pokemon.set.name === `${side}1`,
    )!;
    assert.equal(reserve.hp, reserve.maxhp);
    assert.equal(reserve.fainted, false);
    assert.equal(reserve.faintQueued, false);
    assert.equal(simulated.pokemonLeft, 2);
    assert.deepEqual(result.teams[side].pokemons[0], beforeActive);
    assert.deepEqual(result.teams[side].pokemons[1].statuses, []);
    assert.doesNotThrow(() =>
      choose(result, side, { kind: "switch", captureId: `${side}1` }),
    );
  });
}

test("Full restore resolves before a faster priority attack, consumes one trainer action and keeps damage accounting accurate", () => {
  const setup = fixture([33], [98]);
  setup.teams.a.pokemons[0].pokemon.stats[0].value = 1;
  const started = startTrainerBattle(setup, seed);
  const result = turn(started, item("a0"), 98);
  const max = getMaxHp(result.teams.a.pokemons[0].pokemon)!;
  assert(hp(result, "a") > 1 && hp(result, "a") < max);
  const attack = result.history[0].results.find(
    (result) => result.moveId === 98,
  )!;
  assert.equal(attack.appliedDamage, max - hp(result, "a"));
  assert.equal(
    attack.hpChanges?.find((change) => change.role === "target")?.before,
    max,
  );
  assert.equal(result.history[0].results.length, 1);
  assert.equal(
    result.runtime!.requests.a.moves[0].pp,
    started.runtime!.requests.a.moves[0].pp,
  );
  assert.equal(
    result.runtime!.requests.b.moves[0].pp,
    started.runtime!.requests.b.moves[0].pp - 1,
  );
  assert.equal(result.runtime!.turn, 2);
});

test("both trainers can use Full restore in the same round without fabricating attacks or spending PP", () => {
  const setup = fixture();
  hurt(setup.teams.a.pokemons[0]);
  hurt(setup.teams.b.pokemons[0]);
  const started = startTrainerBattle(setup, seed);
  const result = turn(started, item("a0"), item("b0"));
  for (const side of ["a", "b"] as const) {
    assert.equal(
      hp(result, side),
      getMaxHp(result.teams[side].pokemons[0].pokemon),
    );
    assert.deepEqual(result.teams[side].pokemons[0].statuses, []);
    assert.deepEqual(
      result.runtime!.requests[side].moves.map((move) => move.pp),
      started.runtime!.requests[side].moves.map((move) => move.pp),
    );
  }
  assert.equal(result.runtime!.turn, 2);
  assert.deepEqual(result.history[0].results, []);
  assert.equal(
    result.history[0].events.filter((event) =>
      event.includes("usó Full restore"),
    ).length,
    2,
  );
  assert(validTrainerBattleSession(result));
});

test("Full restore preserves already-used PP and positive Substitute while clearing the target's temporary modifiers", () => {
  let session = startTrainerBattle(fixture([164, 150], [150]), seed);
  session = turn(session, 164, 150);
  const before = battle(session).p1.active[0];
  assert(before.volatiles.substitute);
  const substituteHp = before.volatiles.substitute.hp;
  const remaining = session.runtime!.requests.a.moves.find(
    (move) => move.id === 164,
  )!.pp;
  session = turn(session, item("a0"), 150);
  const after = battle(session).p1.active[0];
  assert(after.volatiles.substitute);
  assert.equal(after.volatiles.substitute.hp, substituteHp);
  assert.equal(
    session.runtime!.requests.a.moves.find((move) => move.id === 164)!.pp,
    remaining,
  );
  assert.equal(hp(session, "a"), getMaxHp(session.teams.a.pokemons[0].pokemon));
});

for (const [effect, moveId] of [
  ["curse", 174],
  ["nightmare", 171],
  ["yawn", 281],
  ["perishsong", 195],
  ["foresight", 193],
] as const) {
  test(`Full restore clears real ${effect} without running harmful End effects`, () => {
    const setup = fixture([150], [moveId, 150]);
    if (effect === "curse")
      setup.teams.b.pokemons[0] = member("b0", 94, [moveId, 150]);
    if (effect === "nightmare") {
      setup.teams.a.pokemons[0].statuses = ["asleep"];
      setup.teams.a.pokemons[0].statusTurns = { asleep: 6 };
    }
    let session = turn(
      startTrainerBattle(setup, seed),
      { kind: "wait" },
      moveId,
    );
    assert(battle(session).p1.active[0].volatiles[effect]);
    session = turn(clone(session), item("a0"), 150);
    const healed = battle(session).p1.active[0];
    assert.equal(healed.volatiles[effect], undefined);
    assert.equal(healed.status, "");
    assert.equal(healed.hp, healed.maxhp);
    assert.deepEqual(session.teams.a.pokemons[0].statusTurns, {});
    assert.equal(session.phase, "battle");
  });
}

test("items cannot target the opponent or an unknown member", () => {
  const started = startTrainerBattle(fixture(), seed);
  const before = JSON.stringify(started);
  for (const side of ["a", "b"] as const) {
    assert.throws(
      () => choose(started, side, item(side === "a" ? "b0" : "a0")),
      /tu equipo/,
    );
    assert.throws(() => choose(started, side, item("missing")), /tu equipo/);
  }
  assert.equal(JSON.stringify(started), before);
});

test("items are forbidden during forced replacement, waiting, charge, recharge and finished battles", () => {
  for (const moveId of [19, 63]) {
    const session = turn(
      startTrainerBattle(fixture([moveId], [150]), seed),
      moveId,
      150,
    );
    assert(session.runtime!.requests.a.locked);
    assert.throws(() => choose(session, "a", item("a0")), /forzado|recarga/);
  }
  const setup = fixture([150], [98]);
  setup.teams.a.pokemons[0].pokemon.stats[0].value = 1;
  const forced = turn(startTrainerBattle(setup, seed), 150, 98);
  assert(forced.runtime!.requests.a.forceSwitch);
  assert(forced.runtime!.requests.b.waiting);
  assert.throws(() => choose(forced, "a", item("a1")), /reemplazo/);
  assert.throws(() => choose(forced, "b", item("b0")), /esperar/);
  const single = fixture([98], [150]);
  single.teams.b.pokemons = [single.teams.b.pokemons[0]];
  single.teams.b.pokemons[0].pokemon.stats[0].value = 1;
  const finished = turn(startTrainerBattle(single, seed), 98, 150);
  assert.equal(finished.phase, "finished");
  assert.throws(() => choose(finished, "a", item("a0")), /activo/);
});
