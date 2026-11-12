import assert from "node:assert/strict";
import { test } from "node:test";
import { Battle } from "@pkmn/sim";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
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
import type { CapturedPokemon } from "../src/types/pokemon";
import type {
  TrainerBattleSession,
  TrainerChoice,
  TrainerSide,
} from "../src/lib/trainerBattle/types";

const seed: [number, number, number, number] = [1, 2, 3, 4];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function member(
  id: string,
  speciesId = 143,
  moveIds = [33, 150],
): CapturedPokemon {
  const species = trainerSpecies.find((entry) => entry.id === speciesId)!;
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
function fixture(own = [33, 150], opponent = [33, 150]): TrainerBattleSession {
  const session = createTrainerBattleSession();
  session.id = "trainer-test";
  session.teams.a = {
    name: "Ana",
    activeCaptureId: "a-active-with-21-characters",
    pokemons: [
      member("a-active-with-21-characters", 143, own),
      member("a-bench", 242),
    ],
  };
  session.teams.b = {
    name: "Bruno",
    activeCaptureId: "b-active-with-21-characters",
    pokemons: [
      member("b-active-with-21-characters", 143, opponent),
      member("b-bench", 242),
    ],
  };
  return session;
}
function choose(
  session: TrainerBattleSession,
  side: TrainerSide,
  move: number | TrainerChoice,
) {
  return chooseTrainerAction(
    session,
    side,
    typeof move === "number" ? { kind: "move", moveId: move } : move,
  );
}
function turn(
  session: TrainerBattleSession,
  a: number | TrainerChoice,
  b: number | TrainerChoice,
) {
  return choose(choose(session, "a", a), "b", b);
}
function active(session: TrainerBattleSession, side: TrainerSide) {
  return session.teams[side].pokemons.find(
    (capture) => capture.captureId === session.teams[side].activeCaptureId,
  )!;
}

test("trainer catalogs provide 386 canonical species and all 354 unique Gen III moves", () => {
  assert.equal(trainerSpecies.length, 386);
  assert.equal(new Set(trainerSpecies.map((entry) => entry.id)).size, 386);
  assert.equal(trainerMoves.length, 354);
  assert.equal(new Set(trainerMoves.map((entry) => entry.id)).size, 354);
  assert.equal(
    trainerSpecies.find((entry) => entry.id === 1)!.baseStats[0].value,
    45,
  );
});

test("both parties initialize symmetrically, and a pending choice changes no HP, PP, turn or history", () => {
  const setup = fixture();
  const original = JSON.stringify(setup);
  const started = startTrainerBattle(setup, seed);
  assert.equal(JSON.stringify(setup), original);
  assert(validTrainerBattleSession(started));
  const queued = choose(started, "b", 33);
  assert.equal(started.runtime!.turn, 1);
  assert.equal(queued.runtime!.turn, 1);
  assert.deepEqual(queued.teams, started.teams);
  assert.deepEqual(queued.history, []);
  assert.deepEqual(
    queued.runtime!.requests.a.moves,
    started.runtime!.requests.a.moves,
  );
  assert.deepEqual(
    queued.runtime!.requests.b.moves,
    started.runtime!.requests.b.moves,
  );
  assert.deepEqual(queued.runtime!.pending.b, { kind: "move", moveId: 33 });
  assert.throws(() => choose(queued, "b", 33), /ya eligió/);
  const cancelled = cancelTrainerAction(queued, "b");
  assert.deepEqual(cancelled.runtime!.pending, {});
  assert.deepEqual(cancelled.teams, started.teams);
  assert.deepEqual(cancelled.history, []);
  assert.equal(cancelled.runtime!.turn, 1);
});

test("real turn damages both teams and attributes results to original capture IDs", () => {
  const started = startTrainerBattle(fixture(), seed);
  const resolved = turn(started, 33, 33);
  assert(
    getCurrentHp(active(resolved, "a").pokemon) <
      getCurrentHp(active(started, "a").pokemon),
  );
  assert(
    getCurrentHp(active(resolved, "b").pokemon) <
      getCurrentHp(active(started, "b").pokemon),
  );
  assert.equal(resolved.runtime!.turn, 2);
  assert.equal(resolved.history.length, 1);
  assert.equal(resolved.history[0].results.length, 2);
  assert.equal(resolved.history[0].completed, true);
  assert.deepEqual(
    new Set(resolved.history[0].results.map((result) => result.captureId)),
    new Set([started.teams.a.activeCaptureId, started.teams.b.activeCaptureId]),
  );
  assert(
    resolved.history[0].results.every((result) => result.appliedDamage > 0),
  );
  assert(validTrainerBattleSession(resolved));
});

test("preloaded primary conditions, sleep counters, HP and stages survive starting both parties", () => {
  const setup = fixture();
  active(setup, "a").statuses = ["asleep"];
  active(setup, "a").statusTurns = { asleep: 4 };
  active(setup, "b").statuses = ["paralyzed"];
  setup.teams.a.pokemons[1].statuses = ["poisoned"];
  setup.teams.b.pokemons[1].statuses = ["burned"];
  for (const side of ["a", "b"] as const) {
    active(setup, side).pokemon.stats[0].value -= 17;
    active(setup, side).pokemon.battleStages = {
      ...neutralBattleStages(),
      accuracy: -3,
      "special-defense": 2,
    };
  }
  const started = startTrainerBattle(setup, seed);
  const expected = clone(setup.teams);
  for (const team of Object.values(expected))
    for (const capture of team.pokemons)
      capture.moves = capture.moves?.map((move) => ({
        ...move,
        currentPp: move.currentPp ?? move.pp!,
      }));
  assert.deepEqual(started.teams, expected);
  assert(validTrainerBattleSession(started));
});

test("initial Taunt and Bind immediately restrict moves and switching on either side", () => {
  const setup = fixture();
  for (const side of ["a", "b"] as const) {
    active(setup, side).statuses = ["taunted", "bound"];
    active(setup, side).statusTurns = { taunted: 2, bound: 3 };
  }
  const started = startTrainerBattle(setup, seed);
  for (const side of ["a", "b"] as const) {
    assert(
      started.runtime!.requests[side].moves.find((move) => move.id === 150)!
        .disabled,
    );
    assert(started.runtime!.requests[side].trapped);
    assert.throws(() => choose(started, side, 150), /no está disponible/);
    assert.throws(
      () =>
        choose(started, side, { kind: "switch", captureId: `${side}-bench` }),
      /trapped|atrapado/i,
    );
  }
});

test("preloaded Disable and Encore require explicit move context without silently deleting their state", () => {
  for (const status of ["disabled", "encored"] as const) {
    const setup = fixture();
    active(setup, "b").statuses = [status];
    active(setup, "b").statusTurns = { [status]: 3 };
    const before = JSON.stringify(setup);
    assert.throws(() => startTrainerBattle(setup, seed), /movimiento afectado/);
    assert.equal(JSON.stringify(setup), before);
  }
});

test("initial Disable and Encore preserve distinct selected moves and immediately restrict both players", () => {
  const setup = fixture();
  for (const side of ["a", "b"] as const) {
    active(setup, side).statuses = ["disabled", "encored"];
    active(setup, side).statusTurns = { disabled: 3, encored: 4 };
    active(setup, side).trainerStatusContext = {
      disabledMoveId: 33,
      encoredMoveId: 150,
    };
  }
  const started = startTrainerBattle(setup, seed);
  const battle = Battle.fromJSON(started.runtime!.engine);
  for (const simulated of [battle.p1, battle.p2]) {
    assert.equal(simulated.active[0].volatiles.disable.move, "tackle");
    assert.equal(simulated.active[0].volatiles.encore.move, "splash");
  }
  for (const side of ["a", "b"] as const) {
    assert.deepEqual(active(started, side).statuses, ["disabled", "encored"]);
    assert.deepEqual(active(started, side).statusTurns, {
      disabled: 3,
      encored: 4,
    });
    const attack = started.runtime!.requests[side].moves.find(
      (move) => move.id === 33,
    );
    assert(!attack || attack.disabled);
    assert(
      started.runtime!.requests[side].moves.some(
        (move) => move.id === 150 && !move.disabled,
      ),
    );
    assert.throws(() => choose(started, side, 33), /no está disponible/);
  }
  assert(validTrainerBattleSession(turn(clone(started), 150, 150)));
});

test("initial Attraction uses explicit compatible genders and ends when its source switches", () => {
  const setup = fixture();
  active(setup, "a").statuses = ["infatuated"];
  active(setup, "a").trainerStatusContext = { gender: "M" };
  active(setup, "b").trainerStatusContext = { gender: "F" };
  const started = startTrainerBattle(setup, seed);
  assert.deepEqual(active(started, "a").statuses, ["infatuated"]);
  assert.equal(started.runtime!.requests.a.gender, "M");
  assert.equal(started.runtime!.requests.b.gender, "F");
  const switched = turn(
    started,
    { kind: "wait" },
    { kind: "switch", captureId: "b-bench" },
  );
  assert.deepEqual(active(switched, "a").statuses, []);
  active(setup, "b").trainerStatusContext = { gender: "M" };
  assert.throws(() => startTrainerBattle(setup, seed), /géneros opuestos/);
});

test("fainted reserves preserve imported primary status and cannot be selected as replacements", () => {
  const setup = fixture();
  setup.teams.a.pokemons[1].pokemon.stats[0].value = 0;
  setup.teams.a.pokemons[1].statuses = ["burned"];
  const started = startTrainerBattle(setup, seed);
  assert.equal(getCurrentHp(started.teams.a.pokemons[1].pokemon), 0);
  assert.deepEqual(started.teams.a.pokemons[1].statuses, ["burned"]);
  assert.throws(
    () => choose(started, "a", { kind: "switch", captureId: "a-bench" }),
    /fainted|debilitado/i,
  );
  assert(validTrainerBattleSession(started));
});

for (const side of ["a", "b"] as const) {
  test(`side ${side} voluntary switch consumes its action, clears temporary conditions and keeps HP/status/PP`, () => {
    const setup = fixture();
    const old = active(setup, side);
    old.pokemon.battleStages = {
      ...neutralBattleStages(),
      attack: 3,
      accuracy: -2,
      evasiveness: 4,
    };
    old.statuses = ["poisoned", "confused"];
    old.statusTurns = { confused: 3 };
    old.pokemon.stats[0].value -= 20;
    const started = startTrainerBattle(setup, seed);
    const other = side === "a" ? "b" : "a";
    const before = Battle.fromJSON(started.runtime!.engine);
    const chosen = choose(started, side, {
      kind: "switch",
      captureId: `${side}-bench`,
    });
    assert.equal(chosen.teams[side].activeCaptureId, old.captureId);
    const resolved = choose(chosen, other, 33);
    assert.equal(resolved.teams[side].activeCaptureId, `${side}-bench`);
    const outgoing = resolved.teams[side].pokemons.find(
      (capture) => capture.captureId === old.captureId,
    )!;
    assert.equal(getCurrentHp(outgoing.pokemon), getCurrentHp(old.pokemon));
    assert.deepEqual(outgoing.statuses, ["poisoned"]);
    assert.deepEqual(outgoing.pokemon.battleStages, neutralBattleStages());
    assert(
      getCurrentHp(active(resolved, side).pokemon) <
        getMaxHp(active(resolved, side).pokemon)!,
    );
    assert(
      !resolved.history[0].results.some(
        (result) => result.actorSide === (side === "a" ? "player" : "opponent"),
      ),
    );
    const after = Battle.fromJSON(resolved.runtime!.engine);
    const simBefore = side === "a" ? before.p1 : before.p2;
    const simAfter = side === "a" ? after.p1 : after.p2;
    assert.equal(
      simAfter.pokemon.find(
        (pokemon) => pokemon.set.name === simBefore.active[0].set.name,
      )!.moveSlots[0].pp,
      simBefore.active[0].moveSlots[0].pp,
    );
    assert.equal(resolved.runtime!.turn, 2);
  });
}

for (const defeated of ["a", "b"] as const) {
  test(`KO on ${defeated} requests a replacement only on that side, without an extra turn`, () => {
    const surviving = defeated === "a" ? "b" : "a";
    const setup = fixture(
      surviving === "a" ? [98] : [33],
      surviving === "b" ? [98] : [33],
    );
    active(setup, defeated).pokemon.stats[0].value = 1;
    const started = startTrainerBattle(setup, seed);
    // Quick Attack guarantees the surviving side acts first despite a speed tie.
    const resolved = turn(
      started,
      surviving === "a" ? 98 : 33,
      surviving === "b" ? 98 : 33,
    );
    assert.equal(resolved.runtime!.requests[defeated].forceSwitch, true);
    assert.equal(resolved.runtime!.requests[surviving].waiting, true);
    assert.equal(getCurrentHp(active(resolved, defeated).pokemon), 0);
    const replacement = choose(resolved, defeated, {
      kind: "switch",
      captureId: `${defeated}-bench`,
    });
    assert.equal(
      replacement.teams[defeated].activeCaptureId,
      `${defeated}-bench`,
    );
    // Gen III finishes the current round after the forced replacement.
    assert.equal(replacement.runtime!.turn, 2);
    assert(!replacement.runtime!.requests[defeated].forceSwitch);
  });
}

test("simultaneous residual KOs require both legal replacements and consume no second turn", () => {
  const setup = fixture([150], [150]);
  for (const side of ["a", "b"] as const) {
    active(setup, side).pokemon.stats[0].value = 1;
    active(setup, side).statuses = ["poisoned"];
  }
  const resolved = turn(startTrainerBattle(setup, seed), 150, 150);
  assert(resolved.runtime!.requests.a.forceSwitch);
  assert(resolved.runtime!.requests.b.forceSwitch);
  const first = choose(resolved, "a", { kind: "switch", captureId: "a-bench" });
  assert(first.runtime!.pending.a);
  const both = choose(first, "b", { kind: "switch", captureId: "b-bench" });
  assert.equal(both.teams.a.activeCaptureId, "a-bench");
  assert.equal(both.teams.b.activeCaptureId, "b-bench");
  assert.equal(both.runtime!.turn, 2);
  assert(!both.runtime!.requests.a.forceSwitch);
  assert(!both.runtime!.requests.b.forceSwitch);
});

test("persisting between both choices preserves exact outcome, PP and PRNG", () => {
  const started = startTrainerBattle(fixture(), seed);
  const pending = choose(started, "a", 33);
  const direct = choose(pending, "b", 33);
  const restored = choose(clone(pending), "b", 33);
  assert.deepEqual(restored, direct);
  for (const side of ["a", "b"] as const)
    assert.equal(
      restored.runtime!.requests[side].moves.find((move) => move.id === 33)!.pp,
      trainerMoves.find((move) => move.id === 33)!.pp! - 1,
    );
  const battle = Battle.fromJSON(restored.runtime!.engine);
  assert.deepEqual(
    battle.prng.getSeed(),
    Battle.fromJSON(direct.runtime!.engine).prng.getSeed(),
  );
});

test("used PP survives switching away and back on both parties", () => {
  let session = turn(startTrainerBattle(fixture(), seed), 33, 33);
  const remaining = {
    a: session.runtime!.requests.a.moves.find((move) => move.id === 33)!.pp,
    b: session.runtime!.requests.b.moves.find((move) => move.id === 33)!.pp,
  };
  assert.equal(
    remaining.a,
    trainerMoves.find((move) => move.id === 33)!.pp! - 1,
  );
  assert.equal(remaining.b, remaining.a);
  session = turn(
    session,
    { kind: "switch", captureId: "a-bench" },
    { kind: "switch", captureId: "b-bench" },
  );
  session = turn(
    session,
    { kind: "switch", captureId: "a-active-with-21-characters" },
    { kind: "switch", captureId: "b-active-with-21-characters" },
  );
  for (const side of ["a", "b"] as const)
    assert.equal(
      session.runtime!.requests[side].moves.find((move) => move.id === 33)!.pp,
      remaining[side],
    );
});

test("side B Baton Pass preserves its native boosts and pauses for a replacement", () => {
  let session = startTrainerBattle(fixture([150], [14, 226, 150]), seed);
  session = turn(session, 150, 14);
  assert.equal(active(session, "b").pokemon.battleStages!.attack, 2);
  session = turn(session, 150, 226);
  assert(session.runtime!.requests.b.forceSwitch);
  session = choose(clone(session), "b", {
    kind: "switch",
    captureId: "b-bench",
  });
  assert.equal(session.teams.b.activeCaptureId, "b-bench");
  assert.equal(active(session, "b").pokemon.battleStages!.attack, 2);
  session = turn(session, 150, {
    kind: "switch",
    captureId: "b-active-with-21-characters",
  });
  assert.deepEqual(
    session.teams.b.pokemons.find((capture) => capture.captureId === "b-bench")!
      .pokemon.battleStages,
    neutralBattleStages(),
  );
});

test("all 354 moves work on the second trainer's real team and produce persistable sessions", () => {
  for (const move of trainerMoves) {
    try {
      const setup = fixture([150], [move.id]);
      const session = turn(startTrainerBattle(setup, seed), 150, move.id);
      assert(validTrainerBattleSession(session));
      assert(
        session.history[0].results.every(
          (result) => result.outcome !== "manual",
        ),
      );
    } catch (error) {
      throw new Error(`${move.id} ${move.name}: ${(error as Error).stack}`);
    }
  }
});

test("Fly and Hyper Beam forced continuations resolve automatically on either side", () => {
  for (const side of ["a", "b"] as const)
    for (const moveId of [19, 63]) {
      const setup = fixture(
        side === "a" ? [moveId] : [150],
        side === "b" ? [moveId] : [150],
      );
      const first = turn(
        startTrainerBattle(setup, seed),
        side === "a" ? moveId : 150,
        side === "b" ? moveId : 150,
      );
      assert(first.runtime!.requests[side].locked);
      const second = choose(clone(first), side === "a" ? "b" : "a", 150);
      assert.equal(second.runtime!.turn, 3);
      assert.equal(Object.keys(second.runtime!.pending).length, 0);
      assert(!second.runtime!.requests[side].locked);
    }
});

test("trainer Roar switches the opposing party and Teleport cannot switch or end the battle", () => {
  const roar = turn(startTrainerBattle(fixture([46], [150]), seed), 46, 150);
  assert.equal(roar.phase, "battle");
  assert.equal(roar.teams.b.activeCaptureId, "b-bench");
  assert.equal(roar.teams.b.pokemons.length, 2);
  const teleport = turn(
    startTrainerBattle(fixture([100], [150]), seed),
    100,
    150,
  );
  assert.equal(teleport.phase, "battle");
  assert.equal(teleport.runtime!.winner, null);
  assert.equal(teleport.teams.a.activeCaptureId, "a-active-with-21-characters");
  assert.equal(teleport.teams.b.activeCaptureId, "b-active-with-21-characters");
  assert.equal(
    teleport.history[0].results.find((result) => result.moveId === 100)
      ?.appliedDamage,
    0,
  );
  assert.equal(
    teleport.runtime!.requests.a.moves[0].pp,
    trainerMoves.find((move) => move.id === 100)!.pp! - 1,
  );
});

test("defeating the final opposing Pokémon records a winner and stops further actions", () => {
  const setup = fixture([33], [150]);
  setup.teams.b.pokemons = [setup.teams.b.pokemons[0]];
  active(setup, "b").pokemon.stats[0].value = 1;
  const resolved = turn(startTrainerBattle(setup, seed), 33, 150);
  assert.equal(resolved.phase, "finished");
  assert.equal(resolved.runtime!.winner, "a");
  assert(resolved.runtime!.ended);
  assert.throws(() => choose(resolved, "a", 33), /activo/);
  assert(validTrainerBattleSession(resolved));
});

test("last Pokémon simultaneous Explosion KOs record a draw and preserve bounded history", () => {
  const setup = fixture([153], [150]);
  for (const side of ["a", "b"] as const) {
    setup.teams[side].pokemons = [setup.teams[side].pokemons[0]];
    active(setup, side).pokemon.stats[0].value = 1;
  }
  const resolved = turn(startTrainerBattle(setup, seed), 153, 150);
  assert.equal(resolved.phase, "finished");
  assert.equal(resolved.runtime!.winner, "draw");
  let long = startTrainerBattle(fixture([150], [150]), seed);
  for (let index = 0; index < 53; index++)
    long = turn(long, { kind: "wait" }, { kind: "wait" });
  assert.equal(long.history.length, 50);
  assert(long.history[0].turn > long.history[49].turn);
  assert(validTrainerBattleSession(long));
});
