import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  addPokemon,
  configureGame,
  captureWildOpponent,
  resetGame,
  setPokemonLevel,
  type PartyState,
} from "../src/slices/partySlice";
import {
  createLeveledPokemon,
  getMaxHp,
  getCurrentHp,
  changeLevel,
  STAT_NAMES,
} from "../src/lib/pokemonStats";
import { gameBalance } from "../src/lib/gameSettings";
import { createBattleOpponent } from "../src/lib/battleOpponent";
import { generateWildEncounter } from "../src/lib/wildEncounter";
import { replaceEvolvedPokemon } from "../src/lib/pokemonEvolution";
import { CURATED_MOVE_CATALOG } from "../src/lib/curatedMoveCatalog";
import type { Pokemon } from "../src/types/pokemon";
function raw(id = 4, name = "charmander"): Pokemon {
  return {
    id,
    name,
    image: null,
    types: ["fire"],
    stats: STAT_NAMES.map((name) => ({ name, value: 50 })),
    learnset: {
      versionGroup: "emerald",
      moves: [
        { id: 52, name: "ember" },
        { id: 33, name: "tackle" },
        { id: 45, name: "growl" },
      ],
    },
  };
}
function setup(level = 5, multiplier = 1.3) {
  return reducer(
    reducer(undefined, { type: "init" }),
    configureGame({
      regions: ["kanto"],
      startingLevel: level,
      hpMultiplier: multiplier,
    }),
  );
}
test("default is level 5, multiplier 1.3; alternatives 5/50 and 1.0–2.0 persist", () => {
  assert.equal(createLeveledPokemon(raw()).level, 5);
  assert.deepEqual(gameBalance(null), { startingLevel: 5, hpMultiplier: 1.3 });
  for (const level of [5, 50])
    for (const rate of [1, 1.3, 2]) {
      const s = reducer(setup(level, rate), addPokemon(raw()));
      const p = s.pokemons[0].pokemon;
      assert.equal(p.level, level);
      assert.equal(p.hpMultiplier, rate);
      assert.equal(getMaxHp(p), Math.floor((level * 2 + 10) * rate));
      assert.equal(getCurrentHp(p), getMaxHp(p));
      assert.equal(
        JSON.parse(JSON.stringify(s)).gameSettings.hpMultiplier,
        rate,
      );
    }
});
test("reject invalid settings, keep settings locked after starter selection", () => {
  const s = setup();
  for (const level of [0, 101, 1.5, NaN])
    assert.equal(
      reducer(
        s,
        configureGame({
          regions: ["kanto"],
          startingLevel: level,
          hpMultiplier: 1.3,
        }),
      ),
      s,
    );
  for (const rate of [0.9, 2.1, 1.35, NaN])
    assert.equal(
      reducer(
        s,
        configureGame({
          regions: ["kanto"],
          startingLevel: 5,
          hpMultiplier: rate,
        }),
      ),
      s,
    );
  const started = reducer(s, addPokemon(raw()));
  assert.equal(
    reducer(
      started,
      configureGame({ regions: ["kanto"], startingLevel: 50, hpMultiplier: 2 }),
    ),
    started,
  );
});
test("changing multiplier only changes HP, never the other base-derived stats", () => {
  const a = createLeveledPokemon(raw(), undefined, 5, 1),
    b = createLeveledPokemon(raw(), undefined, 5, 2);
  assert.equal(getMaxHp(b), getMaxHp(a)! * 2);
  assert.deepEqual(
    a.stats.filter((s) => s.name !== "hp"),
    b.stats.filter((s) => s.name !== "hp"),
  );
});
test("trainer and generated wild encounter retain configured level and multiplier; capture retains them and HP", async () => {
  let state = reducer(setup(5, 2), addPokemon(raw()));
  const balance = gameBalance(state.gameSettings);
  const candidate = createLeveledPokemon(
    raw(37, "vulpix"),
    undefined,
    balance.startingLevel,
    balance.hpMultiplier,
  );
  const trainer = createBattleOpponent(candidate);
  assert.equal(trainer.pokemon.level, 5);
  assert.equal(trainer.pokemon.hpMultiplier, 2);
  const wild = await generateWildEncounter(
    candidate,
    async (id) => {
      const m = CURATED_MOVE_CATALOG[id];
      return {
        id,
        name: m.name,
        displayName: m.name,
        description: m.description,
        ...m.parameters,
      };
    },
    new AbortController().signal,
  );
  assert.equal(wild.pokemon.level, 5);
  assert.equal(wild.pokemon.hpMultiplier, 2);
  wild.pokemon.stats.find((s) => s.name === "hp")!.value = 7;
  state = { ...state, opponent: wild };
  const after = reducer(state, captureWildOpponent(wild.encounterId!));
  assert.equal(after.pokemons.length, 2);
  const capture = after.pokemons[1];
  assert.equal(capture.pokemon.level, 5);
  assert.equal(capture.pokemon.hpMultiplier, 2);
  assert.equal(getCurrentHp(capture.pokemon), 7);
  assert.deepEqual(capture.moves, wild.moves);
  assert.equal(after.opponent, null);
});
test("level up and evolution preserve multiplier and HP ratio, including fainted Pokemon", () => {
  const s = reducer(setup(50, 2), addPokemon(raw()));
  const capture = structuredClone(s.pokemons[0]);
  const max = getMaxHp(capture.pokemon)!;
  capture.pokemon.stats.find((s) => s.name === "hp")!.value = Math.floor(
    max / 2,
  );
  const next = changeLevel(
    capture.pokemon as ReturnType<typeof createLeveledPokemon>,
    51,
  );
  assert.equal(next.hpMultiplier, 2);
  assert.equal(getCurrentHp(next), Math.floor(getMaxHp(next)! / 2));
  const evolved = replaceEvolvedPokemon(capture, raw(5, "charmeleon"));
  assert.equal(evolved.pokemon.level, 50);
  assert.equal(evolved.pokemon.hpMultiplier, 2);
  assert.equal(getCurrentHp(evolved.pokemon), max / 2);
  capture.pokemon.stats.find((s) => s.name === "hp")!.value = 0;
  assert.equal(
    getCurrentHp(replaceEvolvedPokemon(capture, raw(5, "charmeleon")).pokemon),
    0,
  );
  const updated = reducer(
    s,
    setPokemonLevel({ captureId: s.pokemons[0].captureId, level: 51 }),
  );
  assert.equal(updated.pokemons[0].pokemon.hpMultiplier, 2);
});
test("older saves keep existing level and the previous 1.3 HP formula; new game clears configuration", () => {
  const p = createLeveledPokemon(raw(), undefined, 50);
  delete p.hpMultiplier;
  const loaded = JSON.parse(JSON.stringify(p));
  assert.equal(getMaxHp(loaded), 143);
  assert.equal(changeLevel(loaded, 51).level, 51);
  const s = reducer(setup(50, 2), addPokemon(raw()));
  const reset = reducer(s, resetGame());
  assert.equal(reset.gameSettings, null);
  assert.equal(reset.pokemons.length, 0);
  assert.deepEqual(gameBalance(reset.gameSettings), {
    startingLevel: 5,
    hpMultiplier: 1.3,
  });
});
