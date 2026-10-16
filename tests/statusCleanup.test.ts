import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  setBattleOpponent,
  captureWildOpponent,
  togglePokemonStatus,
  type PartyState,
} from "../src/slices/partySlice";
import {
  createLeveledPokemon,
  neutralBattleStages,
  STAT_NAMES,
} from "../src/lib/pokemonStats";
import { clearSecondaryStatuses } from "../src/lib/statusTurns";
import { STATUS_OPTIONS } from "../src/types/pokemon";
function fixture(): PartyState {
  const pokemon = createLeveledPokemon({
    id: 4,
    name: "charmander",
    image: null,
    types: ["fire"],
    stats: STAT_NAMES.map((name) => ({ name, value: 50 })),
    learnset: { versionGroup: "emerald", moves: [{ id: 52, name: "ember" }] },
  });
  return {
    ...reducer(undefined, { type: "init" }),
    starterClaimed: true,
    gameSettings: {
      version: 1,
      regions: ["kanto"],
      ruleset: "rse-emerald",
      startingLevel: 5,
      hpMultiplier: 1.3,
    },
    pokemons: [
      {
        captureId: "a",
        pokemon,
        statuses: ["asleep", "confused", "tormented", "perish-song"],
        statusTurns: { asleep: 3, confused: 2, "perish-song": 1 },
      },
      {
        captureId: "b",
        pokemon: structuredClone(pokemon),
        statuses: ["burned", "bound", "encored"],
        statusTurns: { bound: 3, encored: 2 },
      },
    ],
    opponent: {
      pokemon: structuredClone(pokemon),
      kind: "wild",
      encounterId: "enc",
      stages: neutralBattleStages(),
      moves: [
        {
          id: 52,
          name: "ember",
          displayName: "Ember",
          type: "fire",
          damageClass: "special",
          power: 40,
          accuracy: 100,
          pp: 25,
          priority: 0,
          description: "",
          source: "wild",
        },
      ],
    },
  };
}
test("retirar al oponente limpia secundarios de todo el party y conserva principales, HP y niveles", () => {
  const before = fixture();
  const next = reducer(before, setBattleOpponent(null));
  assert.equal(next.opponent, null);
  assert.deepEqual(next.pokemons[0].statuses, ["asleep"]);
  assert.deepEqual(next.pokemons[0].statusTurns, { asleep: 3 });
  assert.deepEqual(next.pokemons[1].statuses, ["burned"]);
  assert.deepEqual(next.pokemons[1].statusTurns, {});
  assert.deepEqual(
    next.pokemons.map((p) => p.pokemon),
    before.pokemons.map((p) => p.pokemon),
  );
  assert.ok(
    next.activityHistory![0].details.some((d) => d.includes("Torment")),
  );
});
test("capturar al salvaje también limpia secundarios y deja constancia en el mismo log", () => {
  const next = reducer(fixture(), captureWildOpponent("enc"));
  assert.equal(next.pokemons.length, 3);
  assert.equal(next.opponent, null);
  assert.deepEqual(next.pokemons[0].statuses, ["asleep"]);
  assert.deepEqual(next.pokemons[1].statuses, ["burned"]);
  assert.ok(
    next.activityHistory![0].details.some((d) =>
      d.includes("secundarios retirados"),
    ),
  );
});
test("editar al rival o intentar una captura inválida no limpia estados", () => {
  const before = fixture();
  const opponent = structuredClone(before.opponent!);
  opponent.stages.attack = 1;
  const edited = reducer(before, setBattleOpponent(opponent));
  assert.deepEqual(edited.pokemons, before.pokemons);
  assert.equal(reducer(before, captureWildOpponent("otro")), before);
});
test("Torment aparece como adicional, se agrega y retira mediante el toggle y se limpia al cambiar", () => {
  assert.equal(
    STATUS_OPTIONS.find((s) => s.id === "tormented")?.group,
    "additional",
  );
  let s = fixture();
  s = reducer(s, togglePokemonStatus({ captureId: "b", status: "tormented" }));
  assert.ok(s.pokemons[1].statuses!.includes("tormented"));
  assert.ok(s.pokemons[1].statuses!.includes("burned"));
  s = reducer(s, togglePokemonStatus({ captureId: "b", status: "tormented" }));
  assert.ok(!s.pokemons[1].statuses!.includes("tormented"));
  const c = structuredClone(fixture().pokemons[0]);
  clearSecondaryStatuses(c);
  assert.deepEqual(c.statuses, ["asleep"]);
});
