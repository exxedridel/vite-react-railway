import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  executePokemonMove,
  learnPokemonMoveWithTm,
  learnInitialMove,
  setBattleOpponent,
  type PartyState,
} from "../src/slices/partySlice";
import { battleContextKey } from "../src/lib/battleEngine";
import { emptyBattleField } from "../src/lib/battleField";
import { CURATED_MOVE_CATALOG } from "../src/lib/curatedMoveCatalog";
import {
  createLeveledPokemon,
  getCurrentHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { getCurrentMovePp, hydratePartyMovePp } from "../src/lib/movePp";
import { preparePartyItem } from "../src/lib/fullRestorePlan";
import {
  decodeAccountParty,
  encodeAccountParty,
} from "../src/store/accountStorage";
import type { LearnedMove } from "../src/types/moves";

function move(id: number, currentPp?: number): LearnedMove {
  const entry = CURATED_MOVE_CATALOG[id];
  return {
    id,
    name: entry.name,
    displayName: entry.name,
    description: entry.description,
    ...entry.parameters,
    source: "tm",
    ...(currentPp === undefined ? {} : { currentPp }),
  };
}
function pokemon(name: string) {
  const base = [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ].map((name) => ({ name, value: 100 }));
  return createLeveledPokemon(
    { id: 1, name, types: ["normal"], image: null, stats: base },
    base,
    50,
    1.3,
  );
}
function fixture(): PartyState {
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: [
      {
        captureId: "own",
        pokemon: pokemon("own"),
        statuses: [],
        moves: [move(33, 1), move(45, 0)],
      },
    ],
    opponent: {
      kind: "trainer",
      encounterId: "legacy",
      pokemon: pokemon("rival"),
      statuses: [],
      stages: neutralBattleStages(),
      moves: [move(33, 1)],
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
function action(
  state: PartyState,
  moveId = 33,
  commandId = "one",
  confirmed = true,
  accuracy = 0,
) {
  const input = executePokemonMove({
    captureId: "own",
    moveId,
    commandId,
    conditionsConfirmed: confirmed,
    expectedContext: battleContextKey(
      state.pokemons[0],
      state.opponent!,
      state.battleField,
    ),
  });
  input.payload.rolls = { accuracy, critical: 0.5, extra: Array(64).fill(0.5) };
  return input;
}

test("newly learned starter and TM moves begin at maximum even if a reused payload has spent PP", () => {
  const initial = fixture();
  const learned = move(150, 0);
  initial.opponent = null;
  initial.pokemons[0].origin = "starter";
  initial.pokemons[0].pokemon.learnset = {
    versionGroup: "emerald",
    moves: [{ id: learned.id, name: learned.name }],
  };
  for (const learn of [learnPokemonMoveWithTm, learnInitialMove]) {
    const result = reducer(initial, learn({ captureId: "own", move: learned }));
    assert.equal(
      result.pokemons[0].moves!.find((m) => m.id === 150)!.currentPp,
      learned.pp,
    );
    assert.equal(result.pokemons[0].moves![1].currentPp, 0);
  }
});

test("legacy moves debit once on execution, reject exhausted moves and command replay, and persist catalog maximum", () => {
  const initial = fixture();
  const cast = action(initial);
  const used = reducer(initial, cast);
  assert.equal(used.pokemons[0].moves![0].currentPp, 0);
  assert.equal(used.pokemons[0].moves![0].pp, 35);
  assert.equal(reducer(used, cast), used);
  assert.equal(reducer(used, action(used, 33, "exhausted")), used);
  const restored = decodeAccountParty(encodeAccountParty(used))!.party;
  assert.equal(getCurrentMovePp(restored.pokemons[0].moves![0]), 0);
  assert.equal(hydratePartyMovePp(restored).pokemons[0].moves![0].currentPp, 0);
});

test("legacy missed attacks consume PP while unresolved conditions, sleep and a used item do not", () => {
  const initial = fixture();
  const missed = reducer(initial, action(initial, 33, "miss", true, 0.99));
  assert.equal(missed.lastBattleResult!.outcome, "miss");
  assert.equal(missed.pokemons[0].moves![0].currentPp, 0);
  const asleep = fixture();
  asleep.pokemons[0].statuses = ["asleep"];
  const blocked = reducer(asleep, action(asleep, 33, "blocked", false));
  assert.equal(blocked.lastBattleResult!.outcome, "blocked");
  assert.equal(blocked.pokemons[0].moves![0].currentPp, 1);
  const slept = reducer(asleep, action(asleep, 33, "sleep"));
  assert.equal(slept.pokemons[0].moves![0].currentPp, 1);
  const itemUsed = fixture();
  itemUsed.battleField!.playerItemUsedThisTurn = true;
  assert.equal(reducer(itemUsed, action(itemUsed)), itemUsed);
});

test("legacy synthetic Struggle is legal only when every learned move is exhausted and spends no PP", () => {
  const hasPp = fixture();
  assert.equal(reducer(hasPp, action(hasPp, 165)), hasPp);
  const initial = fixture();
  initial.pokemons[0].moves![0].currentPp = 0;
  const before = getCurrentHp(initial.opponent!.pokemon);
  const used = reducer(initial, action(initial, 165));
  assert.equal(used.lastBattleResult!.moveId, 165);
  assert.ok(getCurrentHp(used.opponent!.pokemon) < before);
  assert.deepEqual(
    used.pokemons[0].moves!.map((m) => m.currentPp),
    [0, 0],
  );
});

test("legacy Ether can restore a fainted bench member, consumes the turn and leaves Full Restore separate from PP", async () => {
  const initial = fixture();
  initial.pokemons.push({
    captureId: "bench",
    pokemon: pokemon("bench"),
    moves: [move(33, 0)],
    statuses: ["poisoned"],
  });
  initial.pokemons[1].pokemon.stats.find((s) => s.name === "hp")!.value = 0;
  const used = await preparePartyItem(initial, "bench", "max-ether", 33);
  assert.equal(used.pokemons[1].moves![0].currentPp, 35);
  assert.equal(getCurrentHp(used.pokemons[1].pokemon), 0);
  assert.deepEqual(used.pokemons[1].statuses, ["poisoned"]);
  assert.equal(used.battleField!.playerItemUsedThisTurn, true);
  assert.equal(reducer(used, action(used)), used);
  await assert.rejects(preparePartyItem(used, "own", "max-elixir"), /acción/);
  const outside = { ...initial, opponent: null };
  const healed = await preparePartyItem(outside, "bench", "full-restore");
  assert.equal(healed.pokemons[1].moves![0].currentPp, 0);
  const restored = await preparePartyItem(outside, "bench", "max-elixir");
  await assert.rejects(
    preparePartyItem(restored, "bench", "max-ether", 33),
    /efecto/,
  );
  assert.equal(Boolean(restored.battleField!.playerItemUsedThisTurn), false);
});

test("saved PP migration fills missing values, preserves zero and recovers native PP before discarding an older encounter", () => {
  const initial = fixture();
  delete initial.pokemons[0].moves![0].currentPp;
  const migrated = hydratePartyMovePp(initial);
  assert.equal(migrated.pokemons[0].moves![0].currentPp, 35);
  assert.equal(migrated.pokemons[0].moves![1].currentPp, 0);
  const native = {
    ...initial,
    emerald: {
      version: 1 as const,
      encounterKey: "old",
      engine: JSON.stringify({
        sides: [
          {
            id: "p1",
            pokemon: [
              {
                set: { name: "own" },
                baseMoveSlots: [
                  { id: "tackle", pp: 7 },
                  { id: "growl", pp: 3 },
                ],
              },
            ],
          },
        ],
      }),
      mirror: "",
      pending: {},
      requests: {} as never,
      ended: true,
      events: [],
      serial: 1,
    },
  };
  const cleared = reducer(native, setBattleOpponent(null));
  assert.equal(cleared.pokemons[0].moves![0].currentPp, 7);
  assert.equal(cleared.pokemons[0].moves![1].currentPp, 0);
  const invalid = fixture();
  invalid.pokemons[0].moves![0].currentPp = 36;
  assert.throws(
    () => decodeAccountParty(encodeAccountParty(invalid)),
    /guardada/,
  );
});
