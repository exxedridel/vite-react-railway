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
  const action = executePokemonMove({
    captureId: "own",
    moveId: id,
    actorSide: side,
    commandId: `test-${s.resolvedBattleIds?.length ?? 0}`,
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

import {
  emptyBattleField,
  activateMoveField,
  fieldPowerMultiplier,
  weatherResidual,
} from "../src/lib/battleField";
import {
  finishBattleTurn,
  activateBattlePokemon,
  changeOpponentHp,
  setBattleOpponent,
  resetGame,
} from "../src/slices/partySlice";
import { describePartyActivity } from "../src/lib/partyActivity";
function withWeather(id: number, kind: "sun" | "rain" | "sand" | "hail") {
  const s = fixture(id);
  s.battleField = { ...emptyBattleField(), weather: { kind, turnsLeft: 5 } };
  return s;
}
function end(s: PartyState) {
  const action = finishBattleTurn({
    captureId: "own",
    expectedTurn: s.battleField!.turn,
    expectedContext: battleContextKey(
      s.pokemons[0],
      s.opponent!,
      s.battleField,
    ),
  });
  return { next: reducer(s, action), action };
}

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ResultView from "../src/components/pokemon/BattleResultView";
function rendered(s: PartyState) {
  const html = renderToStaticMarkup(
    createElement(ResultView, { result: s.lastBattleResult! }),
  );
  return { html, text: html.replace(/<[^>]*>/g, "") };
}
test("failed paralysis stores exact roll and displays no applied status", () => {
  const { next } = execute(
    fixture(87),
    87,
    "player",
    {},
    0.1,
    Array(64).fill(0.452),
  );
  const r = next.lastBattleResult!;
  assert.equal(r.effectRolls?.[0].roll, 45.2);
  assert.equal(r.effectRolls?.[0].chance, 30);
  assert.equal(r.effectRolls?.[0].applied, false);
  assert.deepEqual(r.statusChanges, []);
  const { text } = rendered(next);
  assert.ok(text.includes("Probabilidad de Paralyzed: 30%. Tirada: 45.2%"));
  assert.ok(!text.includes("is paralyzed"));
});
test("successful paralysis appears in headline, not duplicate raw message", () => {
  const { next } = execute(
    fixture(87),
    87,
    "player",
    {},
    0.1,
    Array(64).fill(0.2),
  );
  assert.equal(next.lastBattleResult?.effectRolls?.[0].applied, true);
  const { text } = rendered(next);
  assert.ok(text.includes("Wild is paralyzed!"));
  assert.ok(!text.includes("paralyzed aplicado"));
});
test("favorable roll blocked by existing condition is not reported as applied", () => {
  const s = fixture(87);
  s.opponent!.statuses = ["burned"];
  const { next } = execute(s, 87, "player", {}, 0.1, Array(64).fill(0.2));
  assert.equal(next.lastBattleResult?.effectRolls?.[0].passed, true);
  assert.equal(next.lastBattleResult?.effectRolls?.[0].applied, false);
  const { text } = rendered(next);
  assert.ok(text.includes("Tirada favorable; efecto no aplicado"));
  assert.ok(!text.includes("is paralyzed!"));
});
test("KO does not invent a status roll or applied status", () => {
  const s = fixture(87);
  s.opponent!.pokemon.stats[0].value = 1;
  const { next } = execute(s, 87, "player", {}, 0.1, Array(64).fill(0.2));
  assert.deepEqual(next.lastBattleResult?.effectRolls, []);
  assert.deepEqual(next.lastBattleResult?.statusChanges, []);
});
test("special stats labelled, neutral rows and unchanged HP hidden", () => {
  const { next } = execute(fixture(87), 87);
  const { text } = rendered(next);
  assert.ok(text.includes("Ataque SP usado"));
  assert.ok(text.includes("Defensa SP usada"));
  assert.ok(text.includes("modificador"));
  assert.ok(!text.includes("etapa"));
  assert.ok(!text.includes("HP de Own"));
  assert.ok(text.includes("HP de Wild"));
  assert.ok(!text.includes("Quemadura"));
  assert.ok(!text.includes("Crítico"));
  assert.ok(!text.includes("Daño sin crítico"));
});
test("critical and effectiveness colored; burn and rain damage rows conditional", () => {
  const s = withWeather(53, "rain");
  s.pokemons[0].statuses = ["burned"];
  s.opponent!.pokemon.types = ["grass", "bug"];
  const { action } = execute(s, 53);
  action.payload.rolls.critical = 0;
  const next = reducer(s, action);
  const { html, text } = rendered(next);
  assert.ok(text.includes("A critical hit!"));
  assert.ok(text.includes("It&#x27;s extremely effective!"));
  assert.ok(html.includes("text-yellow-600"));
  assert.ok(html.includes("text-green-600"));
  assert.ok(text.includes("Quemadura"));
  assert.ok(text.includes("Clima · Rain Dance"));
  assert.ok(text.includes("×0.5"));
});
test("resisted attack label is orange", () => {
  const s = fixture(53);
  s.opponent!.pokemon.types = ["water"];
  const { html, text } = rendered(execute(s, 53).next);
  assert.ok(html.includes("text-orange-600"));
  assert.ok(text.includes("not very effective"));
});
test("Thunder in rain omits weather damage row", () => {
  const { text } = rendered(execute(withWeather(87, "rain"), 87).next);
  assert.ok(!text.includes("Clima · Rain Dance"));
});
test("Dream Eater displays both changed combatants", () => {
  const s = fixture(138);
  s.opponent!.statuses = ["asleep"];
  s.pokemons[0].pokemon.stats[0].value = 1;
  const { text } = rendered(execute(s, 138).next);
  assert.ok(text.includes("HP de Own"));
  assert.ok(text.includes("HP de Wild"));
});
test("Rest reports self inflicted sleep", () => {
  const s = fixture(156);
  s.pokemons[0].pokemon.stats[0].value = 1;
  const { text } = rendered(execute(s, 156).next);
  assert.ok(text.includes("Own is asleep!"));
});
test("legacy records without new metadata render without fabricated probabilities", () => {
  const next = execute(fixture(87), 87).next;
  const r = { ...next.lastBattleResult! };
  delete r.attackStat;
  delete r.defenseStat;
  delete r.attackerBurned;
  delete r.effectRolls;
  delete r.statusChanges;
  const text = renderToStaticMarkup(createElement(ResultView, { result: r }));
  assert.ok(text.includes("Ataque usado"));
  assert.ok(!text.includes("Probabilidad de Paralyzed"));
});
