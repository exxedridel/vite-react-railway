import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  adjustBattleTurn,
  confirmBattleSwitch,
  executePokemonMove,
  finishBattleTurn,
  setBattleOpponent,
  type PartyState,
} from "../src/slices/partySlice";
import {
  battleContextKey,
  criticalChance,
  getMoveSupportReason,
} from "../src/lib/battleEngine";
import { CURATED_MOVE_CATALOG } from "../src/lib/curatedMoveCatalog";
import { emptyBattleField, getBattleField } from "../src/lib/battleField";
import {
  createLeveledPokemon,
  getCurrentHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import type { LearnedMove } from "../src/types/moves";

function move(id: number): LearnedMove {
  const entry = CURATED_MOVE_CATALOG[id];
  return {
    id,
    name: entry.name,
    displayName: entry.name,
    description: entry.description,
    ...entry.parameters,
    source: "tm",
  };
}
function pokemon(name: string, types = ["psychic"]) {
  const base = [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ].map((name) => ({ name, value: 100 }));
  return createLeveledPokemon(
    { id: 96, name, types, image: null, stats: base },
    base,
    50,
    1.3,
  );
}
function fixture(): PartyState {
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: ["own", "bench"].map((captureId) => ({
      captureId,
      pokemon: pokemon(captureId),
      statuses: [],
      statusTurns: {},
      moves: [move(248), move(353)],
    })),
    opponent: {
      kind: "trainer",
      encounterId: "manual-trainer",
      pokemon: pokemon("rival", ["dark"]),
      statuses: [],
      stages: neutralBattleStages(),
      moves: [move(248), move(353)],
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
function cast(
  state: PartyState,
  moveId = 248,
  side: "player" | "opponent" = "player",
  accuracy = 0,
) {
  const captureId = getBattleField(state.battleField).activeCaptureId!;
  const capture = state.pokemons.find(
    (entry) => entry.captureId === captureId,
  )!;
  const action = executePokemonMove({
    captureId,
    moveId,
    actorSide: side,
    commandId: `move-${state.resolvedBattleIds?.length ?? 0}`,
    expectedContext: battleContextKey(
      capture,
      state.opponent!,
      state.battleField,
    ),
    conditionsConfirmed: true,
  });
  action.payload.rolls = { accuracy, critical: 0, extra: Array(64).fill(0) };
  return reducer(state, action);
}
function end(state: PartyState) {
  const field = getBattleField(state.battleField);
  const capture = state.pokemons.find(
    (entry) => entry.captureId === field.activeCaptureId,
  )!;
  return reducer(
    state,
    finishBattleTurn({
      captureId: capture.captureId,
      expectedTurn: field.turn,
      expectedContext: battleContextKey(capture, state.opponent!, field),
    }),
  );
}
function switchToBench(state: PartyState) {
  return reducer(
    state,
    confirmBattleSwitch({
      fromId: "own",
      toId: "bench",
      expectedContext: JSON.stringify([
        state.pokemons[0],
        state.pokemons[1],
        state.opponent,
        getBattleField(state.battleField),
      ]),
    }),
  );
}

test("legacy Future Sight schedules once, survives JSON and hits at end of the second later turn, without type, STAB or critical", () => {
  let state = fixture();
  const hp = getCurrentHp(state.opponent!.pokemon);
  assert.equal(getMoveSupportReason(move(248)), null);
  assert.equal(criticalChance(move(248)), 0);
  state = cast(state);
  assert.equal(state.lastBattleResult!.outcome, "status");
  assert.equal(state.lastBattleResult!.appliedDamage, 0);
  assert.equal(getCurrentHp(state.opponent!.pokemon), hp);
  assert.equal(state.battleField!.pendingDelayedAttacks![0].damage, 37);
  state = end(state);
  assert.equal(state.battleField!.pendingDelayedAttacks![0].remainingTurns, 2);
  state = JSON.parse(JSON.stringify(state));
  state = end(state);
  assert.equal(getCurrentHp(state.opponent!.pokemon), hp);
  assert.equal(state.battleField!.pendingDelayedAttacks![0].remainingTurns, 1);
  state = end(state);
  assert.equal(getCurrentHp(state.opponent!.pokemon), hp - 37);
  assert.equal(state.lastBattleResult!.moveId, 248);
  assert.equal(state.lastBattleResult!.appliedDamage, 37);
  assert.equal(state.lastBattleResult!.critical, false);
  assert.equal(state.lastBattleResult!.stab, 1);
  assert.equal(state.lastBattleResult!.effectiveness, 1);
  assert.match(
    state.lastFieldEvent!.details.join(" "),
    /37 HP de daño diferido/,
  );
  assert.equal(state.battleField!.pendingDelayedAttacks, undefined);
  state = end(state);
  assert.equal(getCurrentHp(state.opponent!.pokemon), hp - 37);
});

test("Future Sight and Doom Desire share a target position and duplicates cannot replace or restart a pending attack", () => {
  let state = end(cast(fixture()));
  const pending = structuredClone(state.battleField!.pendingDelayedAttacks);
  state = cast(state, 353);
  assert.equal(state.lastBattleResult!.outcome, "miss");
  assert.match(state.lastBattleResult!.message, /pendiente/);
  assert.deepEqual(state.battleField!.pendingDelayedAttacks, pending);
  state = cast(state, 248);
  assert.deepEqual(state.battleField!.pendingDelayedAttacks, pending);
  state = end(end(state));
  state = cast(state, 353);
  assert.equal(state.battleField!.pendingDelayedAttacks![0].moveId, 353);
});

test("manual turn corrections and stale finish commands do not age or reapply future attacks", () => {
  let state = cast(fixture());
  const initial = structuredClone(state.battleField!.pendingDelayedAttacks);
  for (const amount of [1, 1, -1]) {
    const capture = state.pokemons[0];
    state = reducer(
      state,
      adjustBattleTurn({
        captureId: "own",
        expectedContext: battleContextKey(
          capture,
          state.opponent!,
          state.battleField,
        ),
        amount,
      }),
    );
    assert.deepEqual(state.battleField!.pendingDelayedAttacks, initial);
  }
  const action = finishBattleTurn({
    captureId: "own",
    expectedTurn: state.battleField!.turn,
    expectedContext: battleContextKey(
      state.pokemons[0],
      state.opponent!,
      state.battleField,
    ),
  });
  state = reducer(state, action);
  const current = state;
  state = reducer(state, action);
  assert.equal(state, current);
  assert.equal(state.battleField!.pendingDelayedAttacks![0].remainingTurns, 2);
});

test("launch stats remain fixed when the caster switches, faints, or statistics change before impact", () => {
  let state = cast(fixture());
  const hp = getCurrentHp(state.opponent!.pokemon);
  state = structuredClone(state);
  state.pokemons[0].pokemon.stats.find((stat) => stat.name === "hp")!.value = 0;
  state.pokemons[0].pokemon.stats.find(
    (stat) => stat.name === "special-attack",
  )!.value = 9999;
  state.opponent!.pokemon.stats.find(
    (stat) => stat.name === "special-defense",
  )!.value = 1;
  state = switchToBench(state);
  assert.equal(state.battleField!.activeCaptureId, "bench");
  state = end(end(end(state)));
  assert.equal(getCurrentHp(state.opponent!.pokemon), hp - 37);
  assert.equal(state.lastBattleResult!.attackerName, "own");
  assert.equal(state.lastBattleResult!.captureId, "own");
});

test("a future attack reaches the position's replacement and rolls accuracy only on impact", () => {
  let state = fixture();
  // The reducer remains backwards compatible for old wild saves without a
  // native runtime; current wild UI uses the native engine instead.
  state.opponent!.kind = "wild";
  state = cast(state, 248, "opponent", 0.5);
  const firstHp = getCurrentHp(state.pokemons[0].pokemon);
  const benchHp = getCurrentHp(state.pokemons[1].pokemon);
  state = switchToBench(state);
  state = end(end(end(state)));
  assert.equal(getCurrentHp(state.pokemons[0].pokemon), firstHp);
  assert.equal(getCurrentHp(state.pokemons[1].pokemon), benchHp - 37);
  assert.equal(state.lastBattleResult!.opponentName, "bench");

  let miss = fixture();
  miss.opponent!.kind = "wild";
  miss = cast(miss, 248, "opponent", 0.5);
  assert.equal(miss.lastBattleResult!.outcome, "status");
  miss = structuredClone(miss);
  miss.pokemons[1].pokemon.battleStages = {
    ...neutralBattleStages(),
    evasiveness: 6,
  };
  miss = switchToBench(miss);
  miss = end(end(end(miss)));
  assert.equal(getCurrentHp(miss.pokemons[1].pokemon), benchHp);
  assert.equal(miss.lastBattleResult!.outcome, "miss");
  assert.equal(miss.lastBattleResult!.hitChance, 30);
  assert.equal(miss.battleField!.pendingDelayedAttacks, undefined);
});

test("Doom Desire snapshots physical burn and damage variation, ignoring Steel STAB and target immunity", () => {
  let state = fixture();
  state.pokemons[0].statuses = ["burned"];
  state.pokemons[0].pokemon.types = ["steel"];
  state.opponent!.pokemon.types = ["ghost"];
  state = cast(state, 353);
  const hp = getCurrentHp(state.opponent!.pokemon);
  assert.equal(state.battleField!.pendingDelayedAttacks![0].damage, 28);
  state = end(end(end(state)));
  assert.equal(getCurrentHp(state.opponent!.pokemon), hp - 28);
  assert.equal(state.lastBattleResult!.burn, 0.5);

  const input = fixture();
  const action = executePokemonMove({
    captureId: "own",
    moveId: 248,
    commandId: "low-damage-roll",
    expectedContext: battleContextKey(
      input.pokemons[0],
      input.opponent!,
      input.battleField,
    ),
    conditionsConfirmed: true,
  });
  action.payload.rolls = {
    accuracy: 0,
    critical: 0,
    extra: Array(64).fill(0.99),
  };
  const lower = reducer(input, action);
  assert.equal(
    lower.battleField!.pendingDelayedAttacks![0].damage,
    Math.floor(37 * 0.85),
  );
});

test("a pending opposing attack survives its caster being knocked out by another delayed impact", () => {
  let state = fixture();
  state.opponent!.kind = "wild";
  state = cast(cast(state), 353, "opponent");
  state = end(end(state));
  state = structuredClone(state);
  state.opponent!.pokemon.stats.find((stat) => stat.name === "hp")!.value = 1;
  const ownHp = getCurrentHp(state.pokemons[0].pokemon);
  state = end(state);
  assert.equal(getCurrentHp(state.opponent!.pokemon), 0);
  assert.equal(getCurrentHp(state.pokemons[0].pokemon), ownHp - 54);
  assert.equal(state.battleField!.pendingDelayedAttacks, undefined);
});

test("replacing or clearing the encounter removes old pending attacks", () => {
  const state = cast(fixture());
  const cleared = reducer(state, setBattleOpponent(null));
  assert.equal(cleared.battleField!.pendingDelayedAttacks, undefined);
  const replacement = reducer(
    state,
    setBattleOpponent({
      ...state.opponent!,
      encounterId: "different-encounter",
    }),
  );
  assert.equal(replacement.battleField!.pendingDelayedAttacks, undefined);
});
