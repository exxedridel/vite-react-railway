import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CATCH_TIERS,
  CUSTOM_TIER_OVERRIDES,
  tierForSpecies,
  captureSpecies,
  captureRequirements,
  encounterPool,
  pickEncounter,
} from "../src/lib/captureRates";
import { GEN3_CAPTURE_SPECIES } from "../src/lib/gen3CaptureSpecies";
import {
  createLeveledPokemon,
  STAT_NAMES,
  changeLevel,
  getMaxHp,
} from "../src/lib/pokemonStats";
import { generateWildEncounter } from "../src/lib/wildEncounter";
import { CURATED_MOVE_CATALOG } from "../src/lib/curatedMoveCatalog";
import type { RegionId } from "../src/lib/gameSettings";
function party(regions: RegionId[]) {
  return {
    pokemons: [],
    gameSettings: {
      version: 1 as const,
      ruleset: "rse-emerald" as const,
      regions,
    },
  };
}
function pokemon(hp = 100) {
  const p = createLeveledPokemon(
    {
      id: 374,
      name: "beldum",
      types: ["steel", "psychic"],
      image: null,
      stats: STAT_NAMES.map((name) => ({ name, value: 40 })),
    },
    undefined,
    50,
    1,
  );
  p.stats.find((s) => s.name === "hp")!.value = hp;
  return p;
}
test("386 especies únicas y toda especie legendaria/singular es dorada; ninguna otra lo es", () => {
  assert.equal(GEN3_CAPTURE_SPECIES.length, 386);
  assert.equal(new Set(GEN3_CAPTURE_SPECIES.map((s) => s.id)).size, 386);
  for (const s of GEN3_CAPTURE_SPECIES) {
    assert.ok(s.captureRate >= 0 && s.captureRate <= 255);
    assert.equal(tierForSpecies(s).color === "gold", s.legendary || s.mythical);
  }
  assert.equal(tierForSpecies(captureSpecies(151)!).color, "gold");
});
test("umbrales y excepciones homebrew, incluyendo no legendarios con tasa menor a 45", () => {
  for (const [rate, color] of [
    [0, "red"],
    [3, "red"],
    [44, "red"],
    [45, "red"],
    [59, "red"],
    [60, "yellow"],
    [99, "yellow"],
    [100, "blue"],
    [149, "blue"],
    [150, "green"],
    [199, "green"],
    [200, "pink"],
    [255, "pink"],
  ] as const)
    assert.equal(
      tierForSpecies({
        id: 1,
        name: "test",
        captureRate: rate,
        legendary: false,
        mythical: false,
      }).color,
      color,
    );
  for (const [name, color] of Object.entries(CUSTOM_TIER_OVERRIDES))
    assert.equal(
      tierForSpecies(GEN3_CAPTURE_SPECIES.find((s) => s.name === name)!).color,
      color,
    );
});
test("los sorteos filtran solo regiones escogidas y el color, sin duplicados ni sesgo por duplicación", () => {
  const chosen = party(["kanto", "hoenn"]);
  const all = Object.values(CATCH_TIERS).flatMap((t) =>
    encounterPool(chosen, t.color),
  );
  assert.equal(all.length, 151 + 135);
  assert.ok(all.every((s) => s.id <= 151 || s.id >= 252));
  assert.equal(new Set(all.map((s) => s.id)).size, all.length);
  for (const t of Object.values(CATCH_TIERS)) {
    const pool = encounterPool(chosen, t.color);
    assert.ok(pool.every((s) => tierForSpecies(s).color === t.color));
    if (pool.length) {
      assert.equal(
        pickEncounter(pool, () => 0),
        pool[0],
      );
      assert.equal(
        pickEncounter(pool, () => 0.999999),
        pool.at(-1),
      );
    }
  }
  assert.equal(encounterPool(party([]), "pink").length, 0);
  assert.throws(() => pickEncounter([]));
});
test("colores HP exactos: 50% verde; 20% amarillo; menos de 20% rojo; fainted no capturable", () => {
  for (const [hp, bonus] of [
    [100, 0],
    [50, 0],
    [49, 2],
    [20, 2],
    [19, 4],
    [1, 4],
  ])
    assert.equal(captureRequirements(pokemon(hp))!.hpBonus, bonus);
  assert.equal(captureRequirements(pokemon(0)), null);
});
test("un principal da 4 y secundarios dan 2, sin acumulación de estados", () => {
  assert.equal(captureRequirements(pokemon(), [])!.statusBonus, 0);
  assert.equal(
    captureRequirements(pokemon(), ["tormented", "confused"])!.statusBonus,
    2,
  );
  assert.equal(
    captureRequirements(pokemon(), ["burned", "confused"])!.statusBonus,
    4,
  );
  assert.equal(captureRequirements(pokemon(), ["asleep"])!.statusBonus, 4);
});
test("mínimos Poké 13 / Great 11 / Ultra 9 y Master garantizada, sin Infinity serializado", () => {
  const r = captureRequirements(pokemon(40))!;
  assert.deepEqual(
    r.balls.map((b) => b.minimum),
    [13, 11, 9, null],
  );
  assert.ok(!JSON.stringify(r).includes("Infinity"));
  const p = pokemon(1);
  p.id = 10;
  p.name = "caterpie";
  const easy = captureRequirements(p, ["asleep"])!;
  assert.deepEqual(
    easy.balls.map((b) => b.minimum),
    [1, 1, 1, null],
  );
});
test("la previsualización cambia nivel y mantiene HP multiplier; generador conserva nivel y reglas de moves", async () => {
  let p = createLeveledPokemon(
    {
      id: 4,
      name: "charmander",
      types: ["fire"],
      image: null,
      stats: STAT_NAMES.map((name) => ({ name, value: 50 })),
      learnset: {
        versionGroup: "emerald",
        moves: [
          { id: 52, name: "ember" },
          { id: 33, name: "tackle" },
          { id: 45, name: "growl" },
        ],
      },
    },
    undefined,
    5,
    2,
  );
  p = changeLevel(p, 37);
  assert.equal(p.level, 37);
  assert.equal(p.hpMultiplier, 2);
  assert.equal(p.stats.find((s) => s.name === "hp")!.value, getMaxHp(p));
  const encounter = await generateWildEncounter(
    p,
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
  assert.equal(encounter.pokemon.level, 37);
  assert.equal(encounter.pokemon.hpMultiplier, 2);
  assert.equal(encounter.moves!.length, 3);
  assert.equal(encounter.moves![0].id, 52);
  assert.equal(new Set(encounter.moves!.map((m) => m.id)).size, 3);
});
