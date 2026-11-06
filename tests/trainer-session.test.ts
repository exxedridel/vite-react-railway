import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createTrainerBattleSession,
  readTrainerBattleSession,
  trainerSetupErrors,
  validTrainerBattleSession,
  writeTrainerBattleSession,
} from "../src/lib/trainerBattle/model";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import {
  startTrainerBattle,
  chooseTrainerAction,
  cancelTrainerAction,
} from "../src/lib/trainerBattle/engine";
import { createLeveledPokemon, getMaxHp } from "../src/lib/pokemonStats";
import type { CapturedPokemon } from "../src/types/pokemon";

function member(id: number, captureId: string): CapturedPokemon {
  const species = trainerSpecies.find((s) => s.id === id)!;
  return {
    captureId,
    pokemon: createLeveledPokemon({
      id,
      name: species.name,
      image: null,
      types: species.types,
      stats: species.baseStats,
    }),
    moves: [trainerMoves.find((move) => move.id === 150)!],
    statuses: [],
    statusTurns: {},
  };
}

function fixture() {
  const session = createTrainerBattleSession();
  session.teams.a.pokemons = [member(143, "a-1"), member(242, "a-2")];
  session.teams.a.activeCaptureId = "a-1";
  session.teams.b.pokemons = [member(143, "b-1"), member(4, "b-2")];
  session.teams.b.activeCaptureId = "b-1";
  return session;
}

function memoryStorage() {
  let saved: string | null = null;
  return {
    getItem: (_key: string) => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
}

test("draft parties and configuration round-trip with HP and primary conditions intact", () => {
  const storage = memoryStorage();
  assert.equal(readTrainerBattleSession(storage), null);
  const draft = fixture();
  draft.teams.a.pokemons[1].pokemon.stats[0].value = 0;
  draft.teams.b.pokemons[0].statuses = ["asleep"];
  draft.teams.b.pokemons[0].statusTurns = { asleep: 3 };
  writeTrainerBattleSession(storage, draft);
  assert.deepEqual(readTrainerBattleSession(storage), draft);
  assert.deepEqual(trainerSetupErrors(draft), []);
});

test("a saved pending choice resumes the exact same battle after JSON reload", () => {
  const session = startTrainerBattle(fixture(), [1, 2, 3, 4]);
  const pending = chooseTrainerAction(session, "a", {
    kind: "move",
    moveId: 150,
  });
  const storage = memoryStorage();
  writeTrainerBattleSession(storage, pending);
  const loaded = readTrainerBattleSession(storage)!;
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(pending)));
  const choice = { kind: "move", moveId: 150 } as const;
  const resumed = chooseTrainerAction(loaded, "b", choice);
  assert.deepEqual(resumed, chooseTrainerAction(pending, "b", choice));
  assert.equal(resumed.runtime!.turn, pending.runtime!.turn + 1);
  writeTrainerBattleSession(storage, resumed);
  assert.deepEqual(
    readTrainerBattleSession(storage),
    JSON.parse(JSON.stringify(resumed)),
  );
});

test("storage rejects incompatible versions, duplicate IDs, invalid HP and malformed runtime", () => {
  const source = fixture();
  const version = structuredClone(source);
  Object.assign(version, { version: 2 });
  assert.equal(validTrainerBattleSession(version), false);
  const duplicate = structuredClone(source);
  duplicate.teams.b.pokemons[0].captureId = "a-1";
  duplicate.teams.b.activeCaptureId = "a-1";
  assert.equal(validTrainerBattleSession(duplicate), false);
  const hp = structuredClone(source);
  hp.teams.a.pokemons[0].pokemon.stats[0].value =
    getMaxHp(hp.teams.a.pokemons[0].pokemon)! + 1;
  assert.equal(validTrainerBattleSession(hp), false);
  const runtime = startTrainerBattle(source, [1, 2, 3, 4]);
  runtime.runtime!.engine = "broken";
  assert.equal(validTrainerBattleSession(runtime), false);
  runtime.runtime!.engine = "{}";
  assert.equal(validTrainerBattleSession(runtime), false);
  assert.throws(() => readTrainerBattleSession({ getItem: () => "{" }));
});

test("setup requires moves, a living lead and a name before either team can battle", () => {
  const session = fixture();
  session.teams.a.name = "";
  session.teams.a.pokemons[0].moves = [];
  session.teams.a.pokemons[0].pokemon.stats[0].value = 0;
  const errors = trainerSetupErrors(session);
  assert(errors.some((error) => error.includes("nombre")));
  assert(errors.some((error) => error.includes("movimiento")));
  assert(errors.some((error) => error.includes("inicial con HP")));
});

test("a pending Full restore persists privately, can be cancelled and heals its reserve on resolution", () => {
  const draft = fixture();
  draft.teams.a.pokemons[1].pokemon.stats[0].value = 0;
  draft.teams.a.pokemons[1].statuses = ["poisoned"];
  const started = startTrainerBattle(draft, [1, 2, 3, 4]);
  const pending = chooseTrainerAction(started, "a", {
    kind: "item",
    item: "full-restore",
    captureId: "a-2",
  });
  assert.deepEqual(pending.teams, started.teams);
  const storage = memoryStorage();
  writeTrainerBattleSession(storage, pending);
  const loaded = readTrainerBattleSession(storage)!;
  assert.deepEqual(loaded.runtime!.pending.a, {
    kind: "item",
    item: "full-restore",
    captureId: "a-2",
  });
  assert.deepEqual(cancelTrainerAction(loaded, "a").teams, started.teams);
  const restored = chooseTrainerAction(loaded, "b", {
    kind: "move",
    moveId: 150,
  });
  assert.equal(
    restored.teams.a.pokemons[1].pokemon.stats[0].value,
    getMaxHp(restored.teams.a.pokemons[1].pokemon),
  );
  assert.deepEqual(restored.teams.a.pokemons[1].statuses, []);
  assert.equal(restored.runtime!.turn, 2);
  writeTrainerBattleSession(storage, restored);
  assert.deepEqual(
    readTrainerBattleSession(storage),
    JSON.parse(JSON.stringify(restored)),
  );
});

test("pending items can only target the selecting trainer's own party", () => {
  const started = startTrainerBattle(fixture(), [1, 2, 3, 4]);
  started.runtime!.pending.a = {
    kind: "item",
    item: "full-restore",
    captureId: "b-1",
  };
  assert.equal(validTrainerBattleSession(started), false);
  assert.throws(
    () => writeTrainerBattleSession(memoryStorage(), started),
    /guardar/,
  );
});

test("storage failures propagate so a battle action is not presented as saved", () => {
  const blocked = {
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.throws(
    () => writeTrainerBattleSession(blocked, fixture()),
    /QuotaExceededError/,
  );
});
