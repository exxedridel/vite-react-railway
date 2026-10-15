import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  evolvePokemon,
  removePokemon,
  type PartyState,
} from "../src/slices/partySlice";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  STAT_NAMES,
} from "../src/lib/pokemonStats";
import {
  GEN3_EVOLUTIONS,
  evolutionOptions,
  findEvolution,
} from "../src/lib/gen3Evolutions";
import {
  evolutionLevelError,
  evolutionRequirements,
} from "../src/lib/pokemonEvolution";
import type { Pokemon } from "../src/types/pokemon";

function raw(id: number, name: string, base = 50): Pokemon {
  return {
    id,
    name,
    types: ["normal"],
    image: null,
    stats: STAT_NAMES.map((name) => ({ name, value: base })),
    learnset: { versionGroup: "emerald", moves: [{ id: 33, name: "tackle" }] },
  };
}
function fixture(id = 4, name = "charmander", level = 50): PartyState {
  const state = reducer(undefined, { type: "init" });
  const pokemon = createLeveledPokemon(raw(id, name), undefined, level);
  pokemon.battleStages.attack = 2;
  return {
    ...state,
    pokemons: [
      {
        captureId: "first",
        origin: "starter",
        initialMovesChosen: 1,
        pokemon,
        statuses: ["burned", "confused"],
        statusTurns: { confused: 3 },
        moves: [
          {
            id: 33,
            name: "tackle",
            displayName: "Tackle",
            type: "normal",
            damageClass: "physical",
            power: 35,
            accuracy: 95,
            pp: 35,
            priority: 0,
            description: "",
            source: "starter",
          },
        ],
      },
    ],
  };
}
function evolve(
  s: PartyState,
  target = raw(5, "charmeleon", 70),
  extra?: Pokemon,
  expected = JSON.stringify(s.pokemons[0]),
) {
  return evolvePokemon({
    captureId: "first",
    expectedCapture: expected,
    evolution: target,
    requirementsConfirmed: true,
    shedinja: extra,
  });
}

test("catálogo cerrado: 184 transiciones Emerald, destinos Gen 1–3 y ramas correctas", () => {
  assert.equal(GEN3_EVOLUTIONS.length, 184);
  assert.ok(GEN3_EVOLUTIONS.every((r) => r.from <= 386 && r.to <= 386));
  assert.deepEqual(
    evolutionOptions(133)
      .map((r) => r.to)
      .sort((a, b) => a - b),
    [134, 135, 136, 196, 197],
  );
  assert.deepEqual(
    evolutionOptions(281).map((r) => r.to),
    [282],
  );
  assert.equal(evolutionOptions(6).length, 0);
  assert.equal(evolutionOptions(11)[0].to, 12);
  assert.equal(findEvolution(4, 6), undefined);
});
test("evolución reemplaza en la misma posición y conserva nivel, movimientos, origen, estados y etapas", () => {
  const s = fixture();
  s.pokemons.unshift({
    captureId: "other",
    pokemon: createLeveledPokemon(raw(25, "pikachu")),
  });
  const source = s.pokemons[1];
  const result = reducer(
    s,
    evolvePokemon({
      captureId: "first",
      expectedCapture: JSON.stringify(source),
      evolution: raw(5, "charmeleon", 70),
      requirementsConfirmed: true,
    }),
  );
  const next = result.pokemons[1];
  assert.equal(result.pokemons.length, 2);
  assert.equal(next.captureId, "first");
  assert.equal(next.pokemon.id, 5);
  assert.equal(next.pokemon.level, 50);
  assert.equal(next.origin, "starter");
  assert.equal(next.initialMovesChosen, 1);
  assert.deepEqual(next.moves, source.moves);
  assert.deepEqual(next.statuses, source.statuses);
  assert.deepEqual(next.statusTurns, source.statusTurns);
  assert.deepEqual(next.pokemon.battleStages, source.pokemon.battleStages);
  assert.equal(next.pokemon.stats.find((s) => s.name === "attack")?.value, 75);
  assert.equal(result.activityHistory?.[0].kind, "evolution");
});
test("conserva proporción de HP, incluido debilitado", () => {
  for (const fraction of [0, 0.5, 1]) {
    const s = fixture();
    const max = getMaxHp(s.pokemons[0].pokemon)!;
    s.pokemons[0].pokemon.stats[0].value = Math.floor(max * fraction);
    const r = reducer(s, evolve(s));
    const p = r.pokemons[0].pokemon;
    assert.equal(
      getCurrentHp(p),
      Math.floor((getCurrentHp(s.pokemons[0].pokemon) * getMaxHp(p)!) / max),
    );
  }
});
test("bloquea evolución con oponente vivo, también si empezó durante carga", () => {
  const s = fixture(),
    action = evolve(s);
  s.opponent = {
    kind: "wild",
    encounterId: "enc",
    pokemon: createLeveledPokemon(raw(19, "rattata")),
    stages: {},
  } as PartyState["opponent"];
  assert.equal(reducer(s, action), s);
});
test("permite evolución tras debilitar al rival", () => {
  const s = fixture();
  const pokemon = createLeveledPokemon(raw(19, "rattata"));
  pokemon.stats[0].value = 0;
  s.opponent = {
    kind: "wild",
    encounterId: "enc",
    pokemon,
    stages: {},
  } as PartyState["opponent"];
  assert.equal(reducer(s, evolve(s)).pokemons[0].pokemon.id, 5);
});
test("rechaza falta de check, snapshot viejo, salto de etapa y generación posterior", () => {
  const s = fixture();
  const a = evolve(s);
  a.payload.requirementsConfirmed = false;
  assert.equal(reducer(s, a), s);
  assert.equal(
    reducer(s, evolve(s, raw(5, "charmeleon"), undefined, "stale")),
    s,
  );
  assert.equal(reducer(s, evolve(s, raw(6, "charizard"))), s);
  const eevee = fixture(133, "eevee");
  assert.equal(reducer(eevee, evolve(eevee, raw(700, "sylveon"))), eevee);
});
test("no elimina al anterior si datos destino inválidos; duplicado no repite evolución/log", () => {
  const s = fixture(),
    bad = raw(5, "charmeleon");
  bad.stats = [];
  assert.equal(reducer(s, evolve(s, bad)), s);
  const a = evolve(s),
    r = reducer(s, a);
  assert.equal(reducer(r, a), r);
});
test("valida nivel y relaciones de Tyrogue con stats sin etapas", () => {
  const s = fixture(4, "charmander", 15);
  assert.equal(reducer(s, evolve(s)), s);
  const t = fixture(236, "tyrogue", 20);
  assert.equal(
    evolutionLevelError(t.pokemons[0], findEvolution(236, 237)!),
    null,
  );
  assert.ok(evolutionLevelError(t.pokemons[0], findEvolution(236, 106)!));
  assert.ok(
    evolutionRequirements(findEvolution(349, 350)!).join(" ").includes("170"),
  );
});
test("Nincada reemplaza por Ninjask y añade Shedinja solo con espacio, atómicamente", () => {
  const s = fixture(290, "nincada", 20);
  assert.equal(reducer(s, evolve(s, raw(291, "ninjask"))), s);
  const r = reducer(s, evolve(s, raw(291, "ninjask"), raw(292, "shedinja")));
  assert.equal(r.pokemons.length, 2);
  assert.equal(r.pokemons[0].pokemon.id, 291);
  assert.equal(r.pokemons[1].pokemon.id, 292);
  assert.notEqual(r.pokemons[0].captureId, r.pokemons[1].captureId);
  assert.deepEqual(r.pokemons[1].moves, s.pokemons[0].moves);
  const full = fixture(290, "nincada", 20);
  for (let i = 1; i < 6; i++)
    full.pokemons.push({
      captureId: String(i),
      pokemon: createLeveledPokemon(raw(25, "pikachu")),
    });
  const f = reducer(full, evolve(full, raw(291, "ninjask")));
  assert.equal(f.pokemons.length, 6);
  assert.equal(f.pokemons[0].pokemon.id, 291);
});
test("no permite liberar último; permite inicial si hay otro sin reabrir elección", () => {
  const s = fixture();
  assert.equal(reducer(s, removePokemon("first")), s);
  const two = fixture();
  two.pokemons.push({
    captureId: "other",
    pokemon: createLeveledPokemon(raw(25, "pikachu")),
  });
  const r = reducer(two, removePokemon("first"));
  assert.equal(r.pokemons.length, 1);
  assert.equal(r.pokemons[0].captureId, "other");
  assert.equal(r.starterClaimed, true);
});
