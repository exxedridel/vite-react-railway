import assert from "node:assert/strict";
import { test } from "node:test";
import { Battle } from "@pkmn/sim";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import {
  startTrainerBattle,
  chooseTrainerAction,
} from "../src/lib/trainerBattle/engine";
import { createTrainerBattleSession } from "../src/lib/trainerBattle/model";
import {
  createLeveledPokemon,
  getCurrentHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { runEmeraldAction } from "../src/lib/emerald/engine";
import { emptyBattleField } from "../src/lib/battleField";
import type {
  CombatState,
  EmeraldChoice,
  EmeraldUpdate,
} from "../src/lib/emerald/types";
import type { CapturedPokemon } from "../src/types/pokemon";
import type {
  TrainerBattleSession,
  TrainerChoice,
} from "../src/lib/trainerBattle/types";

const seed: [number, number, number, number] = [1, 2, 3, 4];
function member(
  id: string,
  speciesId: number,
  moveIds: number[],
): CapturedPokemon {
  const species = trainerSpecies.find((entry) => entry.id === speciesId)!;
  return {
    captureId: id,
    pokemon: createLeveledPokemon(
      {
        id: species.id,
        name: species.name,
        image: null,
        types: species.types,
        stats: structuredClone(species.baseStats),
      },
      undefined,
      50,
    ),
    moves: moveIds.map((moveId) =>
      structuredClone(trainerMoves.find((move) => move.id === moveId)!),
    ),
    statuses: [],
    statusTurns: {},
  };
}
function fixture(futureMoveId = 248) {
  const session = createTrainerBattleSession();
  session.teams.a = {
    name: "Source",
    activeCaptureId: "source",
    pokemons: [
      member("source", 65, [futureMoveId, 150]),
      member("reserve-a", 143, [150]),
    ],
  };
  session.teams.b = {
    name: "Target",
    activeCaptureId: "target",
    pokemons: [member("target", 143, [150]), member("reserve-b", 242, [150])],
  };
  return startTrainerBattle(session, seed);
}
function round(
  session: TrainerBattleSession,
  a: TrainerChoice = { kind: "move", moveId: 150 },
  b: TrainerChoice = { kind: "move", moveId: 150 },
) {
  return chooseTrainerAction(
    chooseTrainerAction(JSON.parse(JSON.stringify(session)), "a", a),
    "b",
    b,
  );
}
for (const moveId of [248, 353])
  test(`Native delayed move ${moveId} hits at end of turn three once and reports damage through JSON checkpoints`, () => {
    let session = fixture(moveId);
    const before = getCurrentHp(session.teams.b.pokemons[0].pokemon);
    session = round(session, { kind: "move", moveId });
    assert.equal(
      JSON.parse(session.runtime!.engine).sides[1].slotConditions[0].futuremove
        .duration,
      2,
    );
    assert.equal(getCurrentHp(session.teams.b.pokemons[0].pokemon), before);
    assert.equal(
      session.history[0].results.filter((result) => result.moveId === moveId)
        .length,
      1,
    );
    session = round(session);
    assert.equal(getCurrentHp(session.teams.b.pokemons[0].pokemon), before);
    const native = Battle.fromJSON(session.runtime!.engine);
    native.makeChoices("move 2", "move 1");
    session = round(session);
    const after = getCurrentHp(session.teams.b.pokemons[0].pokemon);
    assert.ok(after < before);
    const impacts = session.history[0].results.filter(
      (result) => result.moveId === moveId,
    );
    assert.equal(impacts.length, 1);
    assert.equal(impacts[0].outcome, "hit");
    assert.equal(impacts[0].message, "Impacto del ataque diferido.");
    assert.equal(impacts[0].appliedDamage, before - after);
    assert.equal(impacts[0].critical, false);
    assert.equal(impacts[0].stab, 1);
    assert.equal(impacts[0].effectiveness, 1);
    assert.equal(
      Battle.fromJSON(session.runtime!.engine).p2.active[0].hp,
      native.p2.active[0].hp,
    );
    assert.deepEqual(
      Battle.fromJSON(session.runtime!.engine).prng.getSeed(),
      native.prng.getSeed(),
      "observation must not draw extra RNG",
    );
    session = round(session);
    assert.equal(getCurrentHp(session.teams.b.pokemons[0].pokemon), after);
    assert.equal(
      session.history[0].results.some((result) => result.moveId === moveId),
      false,
    );
  });

test("Native future attack hits the new target in the slot and attributes the original switched-out source", () => {
  let session = round(fixture(), { kind: "move", moveId: 248 });
  const storedDamage = JSON.parse(session.runtime!.engine).sides[1]
    .slotConditions[0].futuremove.moveData.damage;
  const initialTargetHp = getCurrentHp(session.teams.b.pokemons[0].pokemon);
  const reserveHp = getCurrentHp(session.teams.b.pokemons[1].pokemon);
  session = round(
    session,
    { kind: "switch", captureId: "reserve-a" },
    { kind: "switch", captureId: "reserve-b" },
  );
  session = round(session);
  assert.equal(
    getCurrentHp(session.teams.b.pokemons[0].pokemon),
    initialTargetHp,
  );
  assert.equal(
    getCurrentHp(session.teams.b.pokemons[1].pokemon),
    reserveHp - storedDamage,
  );
  const result = session.history[0].results.find(
    (entry) => entry.moveId === 248,
  )!;
  assert.equal(result.captureId, "source");
  assert.match(result.attackerName, /Alakazam/);
  assert.match(result.opponentName, /Blissey/);
  assert.equal(result.appliedDamage, storedDamage);
});

test("Native future attack survives the source fainting and a forced replacement", () => {
  const setup = createTrainerBattleSession();
  const source = member("source", 65, [248, 150]);
  source.pokemon.stats.find((stat) => stat.name === "hp")!.value = 1;
  setup.teams.a = {
    name: "Source",
    activeCaptureId: "source",
    pokemons: [source, member("reserve-a", 143, [150])],
  };
  setup.teams.b = {
    name: "Target",
    activeCaptureId: "target",
    pokemons: [member("target", 143, [33, 150])],
  };
  let session = round(
    startTrainerBattle(setup, seed),
    { kind: "move", moveId: 248 },
    { kind: "move", moveId: 33 },
  );
  assert.equal(getCurrentHp(session.teams.a.pokemons[0].pokemon), 0);
  session = chooseTrainerAction(session, "a", {
    kind: "switch",
    captureId: "reserve-a",
  });
  const before = getCurrentHp(session.teams.b.pokemons[0].pokemon);
  session = round(session);
  session = round(session);
  assert.ok(getCurrentHp(session.teams.b.pokemons[0].pokemon) < before);
  const result = session.history[0].results.find(
    (entry) => entry.moveId === 248,
  )!;
  assert.equal(result.captureId, "source");
  assert.match(result.attackerName, /Alakazam/);
});

function wildFixture(caster: "player" | "opponent"): CombatState {
  const own = member(
    "source",
    caster === "player" ? 65 : 143,
    caster === "player" ? [248, 150] : [150],
  );
  const opponent = member(
    "wild",
    caster === "opponent" ? 65 : 143,
    caster === "opponent" ? [248, 150] : [150],
  );
  return {
    pokemons: [own, member("reserve-a", 242, [150])],
    opponent: {
      kind: "wild",
      encounterId: "future-native",
      pokemon: opponent.pokemon,
      moves: opponent.moves,
      stages: neutralBattleStages(),
      statuses: [],
    },
    battleField: { ...emptyBattleField(), activeCaptureId: own.captureId },
  };
}
function wildRound(
  state: CombatState,
  player: EmeraldChoice = { kind: "move", moveId: 150 },
  opponent: EmeraldChoice = { kind: "move", moveId: 150 },
  initialSeed: [number, number, number, number] = [1, 2, 3, 5],
): EmeraldUpdate {
  const first = runEmeraldAction(
    JSON.parse(JSON.stringify(state)),
    state.battleField!.activeCaptureId!,
    "player",
    player,
    initialSeed,
    "wild-first",
  );
  return runEmeraldAction(
    JSON.parse(JSON.stringify(first)),
    first.battleField!.activeCaptureId!,
    "opponent",
    opponent,
    seed,
    "wild-second",
  );
}
for (const caster of ["player", "opponent"] as const)
  test(`Wild adapter reports native Future Sight damage when cast by ${caster}`, () => {
    let state: CombatState = wildFixture(caster);
    const targetHp = () =>
      caster === "player"
        ? getCurrentHp(state.opponent!.pokemon)
        : getCurrentHp(state.pokemons[0].pokemon);
    const before = targetHp();
    state = wildRound(
      state,
      { kind: "move", moveId: caster === "player" ? 248 : 150 },
      { kind: "move", moveId: caster === "opponent" ? 248 : 150 },
    );
    assert.equal(targetHp(), before);
    state = wildRound(state);
    assert.equal(targetHp(), before);
    const impact = wildRound(state);
    state = impact;
    assert.ok(targetHp() < before);
    const result = impact.results.find((entry) => entry.moveId === 248)!;
    assert.equal(result.actorSide, caster);
    assert.equal(result.appliedDamage, before - targetHp());
    assert.equal(result.message, "Impacto del ataque diferido.");
    const after = targetHp();
    state = wildRound(state);
    assert.equal(targetHp(), after);
  });

test("A native delayed accuracy miss is reported as Future Sight with zero damage, not as Splash", () => {
  let state: CombatState = wildRound(
    wildFixture("player"),
    { kind: "move", moveId: 248 },
    { kind: "move", moveId: 150 },
    seed,
  );
  const before = getCurrentHp(state.opponent!.pokemon);
  state = wildRound(state);
  const impact = wildRound(state);
  assert.equal(getCurrentHp(impact.opponent!.pokemon), before);
  const result = impact.results.find((entry) => entry.moveId === 248)!;
  assert.equal(result.outcome, "miss");
  assert.equal(result.appliedDamage, 0);
  assert.ok(result.protocol?.some((line) => line.startsWith("|-miss|")));
});
