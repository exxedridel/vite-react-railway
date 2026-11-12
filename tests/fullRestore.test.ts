import assert from "node:assert/strict";
import { test } from "node:test";
import { configureStore } from "@reduxjs/toolkit";
import { Battle, Dex } from "@pkmn/sim";
import reducer, {
  changePokemonHp,
  fullRestorePokemon,
  applyFullRestoreToParty,
  finishBattleTurn,
  type PartyState,
} from "../src/slices/partySlice";
import { prepareFullRestoreParty } from "../src/lib/fullRestorePlan";
import {
  emeraldMoves,
  cancelEmeraldChoice,
  runEmeraldAction,
} from "../src/lib/emerald/engine";
import type { EmeraldChoice } from "../src/lib/emerald/types";
import { emptyBattleField } from "../src/lib/battleField";
import { battleContextKey } from "../src/lib/battleEngine";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
  STAT_NAMES,
} from "../src/lib/pokemonStats";
import { STATUS_OPTIONS } from "../src/types/pokemon";
import type { LearnedMove } from "../src/types/moves";

const dex = Dex.forGen(3);
const seed: [number, number, number, number] = [1, 2, 3, 4];
function move(id: number): LearnedMove {
  const m = emeraldMoves.find((candidate) => candidate.num === id)!;
  return {
    id,
    name: m.id,
    displayName: m.name,
    type: m.type.toLowerCase(),
    damageClass: m.category.toLowerCase() as LearnedMove["damageClass"],
    power: m.basePower,
    accuracy: typeof m.accuracy === "number" ? m.accuracy : null,
    pp: m.pp,
    priority: m.priority,
    description: m.desc,
    source: "wild",
  };
}
function pokemon(name: string) {
  const spec = dex.species.get(name);
  return createLeveledPokemon(
    {
      id: spec.num,
      name: spec.id,
      image: null,
      types: spec.types.map((type) => type.toLowerCase()),
      stats: Object.values(spec.baseStats).map((value, index) => ({
        name: STAT_NAMES[index],
        value,
      })),
    },
    undefined,
    50,
  );
}
function fixture(own = [150, 33], foe = [150]): PartyState {
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: [
      {
        captureId: "own",
        pokemon: pokemon("snorlax"),
        moves: own.map(move),
        statuses: [],
      },
      {
        captureId: "bench",
        pokemon: pokemon("blissey"),
        moves: [move(150)],
        statuses: [],
      },
    ],
    opponent: {
      pokemon: pokemon("gengar"),
      kind: "wild",
      encounterId: "restore-encounter",
      moves: foe.map(move),
      stages: neutralBattleStages(),
      statuses: [],
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
function choose(
  state: PartyState,
  side: "player" | "opponent",
  choice: number | EmeraldChoice,
): PartyState {
  return {
    ...state,
    ...runEmeraldAction(
      state,
      state.battleField!.activeCaptureId!,
      side,
      typeof choice === "number" ? { kind: "move", moveId: choice } : choice,
      seed,
      `${state.emerald?.serial ?? 0}-${side}`,
    ),
  };
}
function turn(state: PartyState, own: number, foe: number) {
  return choose(choose(state, "player", own), "opponent", foe);
}
function makeStore(party: PartyState) {
  return configureStore({
    reducer: { party: reducer },
    preloadedState: { party },
  });
}

test("pure Full Restore heals and clears conditions/stages while preserving the rest of the team", () => {
  const initial = fixture(),
    target = initial.pokemons[0];
  target.pokemon.stats[0].value = 0;
  target.statuses = STATUS_OPTIONS.map((s) => s.id);
  target.statusTurns = { confused: 2, asleep: 3 };
  target.pokemon.battleStages = {
    ...neutralBattleStages(),
    attack: 6,
    defense: -6,
  };
  const before = JSON.stringify(initial);
  const restored = applyFullRestoreToParty(initial, "own");
  assert.equal(JSON.stringify(initial), before);
  assert.equal(
    getCurrentHp(restored.pokemons[0].pokemon),
    getMaxHp(target.pokemon),
  );
  assert.deepEqual(restored.pokemons[0].statuses, []);
  assert.deepEqual(restored.pokemons[0].statusTurns, {});
  assert.deepEqual(
    restored.pokemons[0].pokemon.battleStages,
    neutralBattleStages(),
  );
  assert.deepEqual(restored.pokemons[1], initial.pokemons[1]);
  assert.deepEqual(restored.bag, initial.bag);
  assert.equal(restored.activityHistory?.[0].captureId, "own");
});
test("legacy thunk cannot restore for free without the inventory coordinator", async () => {
  const initial = fixture();
  initial.pokemons[0].pokemon.stats[0].value = 20;
  const store = makeStore(initial),
    before = JSON.stringify(store.getState());
  await assert.rejects(
    store.dispatch(fullRestorePokemon("own")),
    /Bag|inventario/,
  );
  assert.equal(JSON.stringify(store.getState()), before);
});
test("outside combat the prepared effect heals without changing inventory or another Pokemon", async () => {
  const initial = fixture();
  initial.opponent = null;
  initial.pokemons[0].pokemon.stats[0].value = 20;
  const prepared = await prepareFullRestoreParty(initial, "own");
  assert.equal(getCurrentHp(initial.pokemons[0].pokemon), 20);
  assert.equal(
    getCurrentHp(prepared.pokemons[0].pokemon),
    getMaxHp(initial.pokemons[0].pokemon),
  );
  assert.deepEqual(prepared.bag, initial.bag);
  assert.deepEqual(prepared.pokemons[1], initial.pokemons[1]);
});
test("wild Full Restore consumes the player action, survives JSON and uses no move PP", async () => {
  const initial = fixture();
  initial.pokemons[0].pokemon.stats[0].value = 40;
  initial.pokemons[0].statuses = ["burned"];
  const queued = await prepareFullRestoreParty(initial, "own");
  assert.equal(getCurrentHp(queued.pokemons[0].pokemon), 40);
  assert.equal(queued.emerald?.pending.player?.kind, "item");
  assert.throws(() => cancelEmeraldChoice(queued, "player"), /confirmado/);
  const before = Battle.fromJSON(queued.emerald!.engine);
  const resolved = choose(JSON.parse(JSON.stringify(queued)), "opponent", 150);
  const after = Battle.fromJSON(resolved.emerald!.engine);
  assert.equal(
    getCurrentHp(resolved.pokemons[0].pokemon),
    getMaxHp(initial.pokemons[0].pokemon),
  );
  assert.deepEqual(resolved.pokemons[0].statuses, []);
  assert.equal(after.turn, before.turn + 1);
  assert.deepEqual(
    after.p1.pokemon[0].moveSlots.map((m) => m.pp),
    before.p1.pokemon[0].moveSlots.map((m) => m.pp),
  );
  assert.equal(
    resolved.emerald!.events.filter((e) => e.includes("Full restore en "))
      .length,
    1,
  );
});
test("unknown, healthy and already chosen targets never prepare another paid action", async () => {
  await assert.rejects(prepareFullRestoreParty(fixture(), "missing"), /v?lido/);
  await assert.rejects(
    prepareFullRestoreParty(fixture(), "own"),
    /no necesita/,
  );
  const initial = fixture();
  initial.pokemons[0].pokemon.stats[0].value = 40;
  const queued = await prepareFullRestoreParty(initial, "own");
  await assert.rejects(prepareFullRestoreParty(queued, "own"), /eligi?|acci?n/);
});
test("legacy encounter Full Restore spends its local action until turn completion", async () => {
  const initial = fixture();
  initial.opponent!.kind = "trainer";
  initial.pokemons[0].pokemon.stats[0].value = 40;
  const restored = await prepareFullRestoreParty(initial, "own");
  assert.equal(restored.battleField!.playerItemUsedThisTurn, true);
  assert.equal(
    getCurrentHp(restored.pokemons[0].pokemon),
    getMaxHp(initial.pokemons[0].pokemon),
  );
  const again = JSON.parse(JSON.stringify(restored));
  again.pokemons[1].pokemon.stats[0].value = 30;
  await assert.rejects(prepareFullRestoreParty(again, "bench"), /turno/);
  const next = reducer(
    restored,
    finishBattleTurn({
      captureId: "own",
      expectedTurn: restored.battleField!.turn,
      expectedContext: battleContextKey(
        restored.pokemons[0],
        restored.opponent!,
        restored.battleField!,
      ),
    }),
  );
  assert.equal(next.battleField!.playerItemUsedThisTurn, false);
  assert.equal(next.battleField!.turn, restored.battleField!.turn + 1);
});
