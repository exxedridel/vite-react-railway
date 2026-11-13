import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCaptureTurnAvailable,
  runFailedCaptureTurn,
} from "../src/lib/captureTurn";
import { runEmeraldAction } from "../src/lib/emerald/engine";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import {
  createLeveledPokemon,
  getCurrentHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { emptyBattleField } from "../src/lib/battleField";
import { getCurrentMovePp } from "../src/lib/movePp";
import type { CombatState } from "../src/lib/emerald/types";
import type { CapturedPokemon } from "../src/types/pokemon";
const seed: [number, number, number, number] = [1, 2, 3, 4];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
function member(captureId: string, moveIds = [33]): CapturedPokemon {
  const s = trainerSpecies.find((s) => s.id === 143)!;
  return {
    captureId,
    pokemon: createLeveledPokemon(
      {
        id: s.id,
        name: s.name,
        image: null,
        types: [...s.types],
        stats: clone(s.baseStats),
      },
      undefined,
      50,
    ),
    moves: moveIds.map((id) => ({
      ...clone(trainerMoves.find((m) => m.id === id)!),
      currentPp: 5,
      source: "wild" as const,
    })),
    statuses: [],
    statusTurns: {},
  };
}
function fixture(own = [33], foe = [33]): CombatState {
  const wild = member("wild", foe);
  return {
    pokemons: [member("own", own), member("bench")],
    opponent: {
      kind: "wild",
      encounterId: "capture-turn",
      pokemon: wild.pokemon,
      moves: wild.moves!,
      stages: neutralBattleStages(),
      statuses: [],
      statusTurns: {},
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
test("failed physical throw uses one action, automatic legal wild move and no player PP; deterministic retry", () => {
  const before = fixture();
  const original = clone(before);
  const a = runFailedCaptureTurn(before, "own", seed, "miss");
  const b = runFailedCaptureTurn(before, "own", seed, "miss");
  assert.deepEqual(a, b);
  assert.deepEqual(before, original);
  assert.equal(a.battleField!.turn, 2);
  assert.equal(getCurrentMovePp(a.opponent!.moves![0]), 4);
  assert.equal(getCurrentMovePp(a.pokemons[0].moves![0]), 5);
  assert(
    getCurrentHp(a.pokemons[0].pokemon) <
      getCurrentHp(before.pokemons[0].pokemon),
  );
  assert.equal(a.completed, true);
  assert.deepEqual(a.emerald!.pending, {});
});
test("an already chosen wild move responds once, without selecting a second move", () => {
  const queued = runEmeraldAction(
    fixture(),
    "own",
    "opponent",
    { kind: "move", moveId: 33 },
    seed,
    "wild-queued",
  );
  const next = runFailedCaptureTurn(queued, "own", seed, "miss");
  assert.equal(getCurrentMovePp(next.opponent!.moves![0]), 4);
  assert.equal(next.battleField!.turn, 2);
  assert.deepEqual(next.emerald!.pending, {});
});
test("capture preflight rejects already selected moves and legacy spent actions without changing state", () => {
  const queued = runEmeraldAction(
    fixture(),
    "own",
    "player",
    { kind: "move", moveId: 33 },
    seed,
    "own-queued",
  );
  assert.throws(
    () => assertCaptureTurnAvailable(queued, "own", seed),
    /pendiente/,
  );
  const legacy = fixture();
  legacy.battleField!.playerItemUsedThisTurn = true;
  assert.throws(
    () => assertCaptureTurnAvailable(legacy, "own", seed),
    /acción/,
  );
});
test("mandatory player recharge blocks throwing, while wild recharge continues natively", () => {
  let state = runEmeraldAction(
    fixture([150], [63]),
    "own",
    "player",
    { kind: "move", moveId: 150 },
    seed,
    "start",
  );
  state = runEmeraldAction(
    state,
    "own",
    "opponent",
    { kind: "move", moveId: 63 },
    seed,
    "beam",
  );
  assert.equal(state.emerald!.requests.opponent.locked, true);
  const pp = state.opponent!.moves![0].currentPp;
  const next = runFailedCaptureTurn(state, "own", seed, "miss");
  assert.equal(next.opponent!.moves![0].currentPp, pp);
  assert.equal(next.emerald!.requests.opponent.locked, false);
  assert.equal(next.battleField!.turn, 3);
  state = runEmeraldAction(
    fixture([63], [150]),
    "own",
    "player",
    { kind: "move", moveId: 63 },
    seed,
    "beam-own",
  );
  state = runEmeraldAction(
    state,
    "own",
    "opponent",
    { kind: "move", moveId: 150 },
    seed,
    "splash",
  );
  assert.throws(
    () => assertCaptureTurnAvailable(state, "own", seed),
    /forzado|recarga/,
  );
});
test("wild response that knocks out the active member persists the response and requires replacement", () => {
  const state = fixture();
  state.pokemons[0].pokemon.stats.find((s) => s.name === "hp")!.value = 1;
  const next = runFailedCaptureTurn(state, "own", seed, "ko");
  assert.equal(getCurrentHp(next.pokemons[0].pokemon), 0);
  assert.equal(next.emerald!.requests.player.forceSwitch, true);
  assert.equal(next.completed, true);
  assert.equal(getCurrentMovePp(next.opponent!.moves![0]), 4);
  assert.throws(
    () => assertCaptureTurnAvailable(next, "own", seed),
    /reemplazo|activo/,
  );
});
