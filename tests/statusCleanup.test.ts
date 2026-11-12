import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  setBattleOpponent,
  captureWildOpponent,
  togglePokemonStatus,
  type PartyState,
} from "../src/slices/partySlice";
import {
  changeLevel,
  createLeveledPokemon,
  neutralBattleStages,
  STAT_NAMES,
} from "../src/lib/pokemonStats";
import { clearSecondaryStatuses } from "../src/lib/statusTurns";
import { STATUS_OPTIONS } from "../src/types/pokemon";
import { emptyBattleField } from "../src/lib/battleField";
function fixture(): PartyState {
  const pokemon = createLeveledPokemon({
    id: 4,
    name: "charmander",
    image: null,
    types: ["fire"],
    stats: STAT_NAMES.map((name) => ({ name, value: 50 })),
    learnset: { versionGroup: "emerald", moves: [{ id: 52, name: "ember" }] },
  });
  pokemon.battleStages = {
    attack: 3,
    defense: -2,
    "special-attack": 4,
    "special-defense": -5,
    speed: 6,
    accuracy: -1,
    evasiveness: 2,
  };
  const state: PartyState = {
    ...reducer(undefined, { type: "init" }),
    starterClaimed: true,
    battleField: { ...emptyBattleField(), activeCaptureId: "a" },
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
        pokemon: changeLevel(pokemon, 12),
        statuses: ["burned", "bound", "encored"],
        statusTurns: { bound: 3, encored: 2 },
      },
    ],
    opponent: {
      pokemon: structuredClone(pokemon),
      kind: "wild",
      encounterId: "enc",
      stages: neutralBattleStages(),
      statuses: ["asleep", "confused"],
      statusTurns: { asleep: 4, confused: 2 },
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
  for (const member of state.pokemons) {
    member.moves = structuredClone(state.opponent!.moves);
    member.pokemon.stats.find((stat) => stat.name === "hp")!.value -= 2;
  }
  state.opponent!.pokemon.stats.find((stat) => stat.name === "hp")!.value -= 3;
  return state;
}
function assertPartyRecovered(before: PartyState, after: PartyState) {
  for (const old of before.pokemons) {
    const member = after.pokemons.find(
      (pokemon) => pokemon.captureId === old.captureId,
    )!;
    assert.deepEqual(member.pokemon, {
      ...old.pokemon,
      battleStages: neutralBattleStages(),
    });
    assert.deepEqual(member.moves, old.moves);
  }
  assert.deepEqual(after.pokemons[0].statuses, ["asleep"]);
  assert.deepEqual(after.pokemons[0].statusTurns, { asleep: 3 });
  assert.deepEqual(after.pokemons[1].statuses, ["burned"]);
  assert.deepEqual(after.pokemons[1].statusTurns, {});
}
test("retirar al oponente neutraliza los siete stages de activos y banca, limpia secundarios y conserva HP, niveles, movimientos y principales", () => {
  const before = fixture();
  const next = reducer(before, setBattleOpponent(null));
  assert.equal(next.opponent, null);
  assertPartyRecovered(before, next);
  assert.ok(
    next.activityHistory![0].details.some((d) => d.includes("Torment")),
  );
});
test("capturar neutraliza el equipo completo y la captura sin curar HP ni estados principales", () => {
  const before = fixture();
  const next = reducer(before, captureWildOpponent("enc"));
  assert.equal(next.pokemons.length, 3);
  assert.equal(next.opponent, null);
  assertPartyRecovered(before, next);
  const captured = next.pokemons[2];
  assert.deepEqual(captured.pokemon, {
    ...before.opponent!.pokemon,
    battleStages: neutralBattleStages(),
  });
  assert.deepEqual(
    captured.moves,
    before.opponent!.moves!.map((move) => ({
      ...move,
      currentPp: move.currentPp ?? move.pp,
    })),
  );
  assert.deepEqual(captured.statuses, ["asleep"]);
  assert.deepEqual(captured.statusTurns, { asleep: 4 });
  assert.ok(
    next.activityHistory![0].details.some((d) =>
      d.includes("secundarios retirados"),
    ),
  );
});
test("editar el mismo rival o intentar una captura inválida conserva estados y stages del equipo", () => {
  const before = fixture();
  const opponent = structuredClone(before.opponent!);
  opponent.stages.attack = 1;
  const edited = reducer(before, setBattleOpponent(opponent));
  assert.deepEqual(edited.pokemons, before.pokemons);
  assert.equal(reducer(before, captureWildOpponent("otro")), before);
});

test("reemplazar el encuentro limpia los estados temporales del equipo anterior", () => {
  const before = fixture();
  const opponent = structuredClone(before.opponent!);
  opponent.encounterId = "new-encounter";
  const next = reducer(before, setBattleOpponent(opponent));
  assert.equal(next.opponent?.encounterId, "new-encounter");
  assertPartyRecovered(before, next);
  assert.deepEqual(next.opponent, opponent);
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
