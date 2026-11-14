import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  executePokemonMove,
  finishBattleTurn,
  type PartyState,
} from "../src/slices/partySlice";
import {
  isOpponentAutomatic,
  usesNativeLocalEngine,
} from "../src/lib/battleOpponent";
import { runPlayerActionWithAutomaticOpponent } from "../src/lib/opponentAutomation";
import { runEmeraldAction } from "../src/lib/emerald/engine";
import { submitEmeraldAction } from "../src/lib/emerald/commands";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import { preparePartyItem } from "../src/lib/fullRestorePlan";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { emptyBattleField } from "../src/lib/battleField";
import { getCurrentMovePp, getMaxMovePp } from "../src/lib/movePp";
import { combatKey } from "../src/lib/emerald/types";
import { validShopCatalog } from "../src/lib/shop/wallet";
import { SHOP_ITEM_IDS } from "../src/lib/shop/types";
import type { CapturedPokemon } from "../src/types/pokemon";
import type { AppDispatch, RootState } from "../src/store/store";

const seed: [number, number, number, number] = [1, 2, 3, 4];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function member(captureId: string, ids = [33, 150]): CapturedPokemon {
  const species = trainerSpecies.find((entry) => entry.id === 143)!;
  return {
    captureId,
    pokemon: createLeveledPokemon(
      {
        id: species.id,
        name: species.name,
        image: null,
        types: [...species.types],
        stats: clone(species.baseStats),
      },
      undefined,
      50,
    ),
    moves: ids.map((id) => ({
      ...clone(trainerMoves.find((move) => move.id === id)!),
      currentPp: 5,
    })),
    statuses: [],
    statusTurns: {},
  };
}
function fixture(
  kind: "wild" | "trainer" = "wild",
  own = [33, 150],
  foe = [33],
): PartyState {
  const enemy = member("enemy", foe);
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: [member("own", own), member("bench")],
    opponent: {
      kind,
      encounterId: `auto-${kind}`,
      pokemon: enemy.pokemon,
      moves: enemy.moves,
      stages: neutralBattleStages(),
      statuses: [],
      statusTurns: {},
      automation: { enabled: true, catalogRevision: 8 },
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}

for (const kind of ["wild", "trainer"] as const) {
  test(`${kind}: one player command resolves exactly one NPC move and saves frozen mode`, () => {
    const input = fixture(kind),
      original = clone(input);
    const result = runPlayerActionWithAutomaticOpponent(
      input,
      "own",
      { kind: "move", moveId: 33 },
      seed,
      "turn",
    );
    assert.equal(result.battleField!.turn, 2);
    assert.equal(getCurrentMovePp(result.pokemons[0].moves![0]), 4);
    assert.equal(getCurrentMovePp(result.opponent!.moves![0]), 4);
    assert.deepEqual(result.emerald!.pending, {});
    assert.deepEqual(result.opponent!.automation, {
      enabled: true,
      catalogRevision: 8,
    });
    assert.deepEqual(input, original);
    assert.deepEqual(
      result,
      runPlayerActionWithAutomaticOpponent(
        input,
        "own",
        { kind: "move", moveId: 33 },
        seed,
        "turn",
      ),
    );
    const reloaded = clone(result);
    const next = runPlayerActionWithAutomaticOpponent(
      reloaded,
      "own",
      { kind: "move", moveId: 33 },
      seed,
      "next",
    );
    assert.equal(next.battleField!.turn, 3);
    assert.equal(getCurrentMovePp(next.opponent!.moves![0]), 3);
  });
}
test("missing metadata preserves manual encounters and legacy hashes without normalization", () => {
  const input = fixture("trainer");
  delete input.opponent!.automation;
  const hash = combatKey(input);
  assert.equal(isOpponentAutomatic(input.opponent), false);
  assert.equal(usesNativeLocalEngine(input.opponent), false);
  assert.equal(combatKey(input), hash);
  assert.throws(
    () =>
      runEmeraldAction(
        input,
        "own",
        "player",
        { kind: "move", moveId: 33 },
        seed,
        "old",
      ),
    /manual/,
  );
  input.opponent!.kind = "wild";
  assert.equal(usesNativeLocalEngine(input.opponent), true);
  const pending = runEmeraldAction(
    input,
    "own",
    "player",
    { kind: "move", moveId: 33 },
    seed,
    "old-wild",
  );
  assert.equal(pending.battleField!.turn, 1);
  assert(pending.emerald!.pending.player);
  assert.equal(getCurrentMovePp(pending.opponent!.moves![0]), 5);
});
test("automatic voluntary switch gives one enemy response; a preselected enemy is not chosen twice", () => {
  const input = fixture();
  const result = runPlayerActionWithAutomaticOpponent(
    input,
    "own",
    { kind: "switch", captureId: "bench" },
    seed,
    "switch",
  );
  assert.equal(result.battleField!.activeCaptureId, "bench");
  assert.equal(result.battleField!.turn, 2);
  assert.equal(getCurrentMovePp(result.opponent!.moves![0]), 4);
  assert.equal(getCurrentMovePp(result.pokemons[0].moves![0]), 5);
  assert(
    getCurrentHp(result.pokemons[1].pokemon) <
      getCurrentHp(input.pokemons[1].pokemon),
  );
  const pending = runEmeraldAction(
    input,
    "own",
    "opponent",
    { kind: "move", moveId: 33 },
    seed,
    "queued",
  );
  const resolved = runPlayerActionWithAutomaticOpponent(
    pending,
    "own",
    { kind: "move", moveId: 150 },
    seed,
    "resolve",
  );
  assert.equal(resolved.battleField!.turn, 2);
  assert.equal(getCurrentMovePp(resolved.opponent!.moves![0]), 4);
});
test("KO waits for replacement and replacing does not grant a second enemy action", () => {
  const input = fixture("trainer", [150], [33]);
  input.pokemons[0].pokemon.stats.find((stat) => stat.name === "hp")!.value = 1;
  const knockout = runPlayerActionWithAutomaticOpponent(
    input,
    "own",
    { kind: "move", moveId: 150 },
    seed,
    "ko",
  );
  assert.equal(getCurrentHp(knockout.pokemons[0].pokemon), 0);
  assert.equal(knockout.emerald!.requests.player.forceSwitch, true);
  assert.equal(getCurrentMovePp(knockout.opponent!.moves![0]), 4);
  const replace = runPlayerActionWithAutomaticOpponent(
    knockout,
    "own",
    { kind: "switch", captureId: "bench" },
    seed,
    "replace",
  );
  assert.equal(replace.battleField!.activeCaptureId, "bench");
  assert.equal(getCurrentMovePp(replace.opponent!.moves![0]), 4);
  assert.equal(
    getCurrentHp(replace.pokemons[1].pokemon),
    getCurrentHp(input.pokemons[1].pokemon),
  );
  assert.deepEqual(replace.emerald!.pending, {});
});
test("multi-turn attacks, enemy recharge and Struggle follow native PP legality", () => {
  const dig = fixture("wild", [91], [150]);
  const first = runPlayerActionWithAutomaticOpponent(
    dig,
    "own",
    { kind: "move", moveId: 91 },
    seed,
    "dig1",
  );
  assert.equal(getCurrentMovePp(first.pokemons[0].moves![0]), 4);
  const second = runPlayerActionWithAutomaticOpponent(
    first,
    "own",
    { kind: "move", moveId: 91 },
    seed,
    "dig2",
  );
  assert.equal(getCurrentMovePp(second.pokemons[0].moves![0]), 4);
  assert.equal(getCurrentMovePp(second.opponent!.moves![0]), 3);
  const hyper = fixture("trainer", [150], [63]);
  const fired = runPlayerActionWithAutomaticOpponent(
    hyper,
    "own",
    { kind: "move", moveId: 150 },
    seed,
    "hyper",
  );
  assert.equal(fired.emerald!.requests.opponent.locked, true);
  const recharge = runPlayerActionWithAutomaticOpponent(
    fired,
    "own",
    { kind: "move", moveId: 150 },
    seed,
    "recharge",
  );
  assert.equal(getCurrentMovePp(recharge.opponent!.moves![0]), 4);
  assert.equal(recharge.battleField!.turn, 3);
  const exhausted = fixture("trainer", [150], [33]);
  exhausted.opponent!.moves![0].currentPp = 0;
  const struggle = runPlayerActionWithAutomaticOpponent(
    exhausted,
    "own",
    { kind: "move", moveId: 150 },
    seed,
    "struggle",
  );
  assert.equal(getCurrentMovePp(struggle.opponent!.moves![0]), 0);
  assert(
    struggle.results.some(
      (result) => result.actorSide === "opponent" && result.moveId === 165,
    ),
  );
});
test("NPC avoids reselecting Future Sight while its delayed hit is pending", () => {
  const input = fixture("trainer", [150], [248, 150]);
  const first = runPlayerActionWithAutomaticOpponent(
    input,
    "own",
    { kind: "move", moveId: 150 },
    seed,
    "future1",
  );
  assert.equal(getCurrentMovePp(first.opponent!.moves![0]), 4);
  const next = runPlayerActionWithAutomaticOpponent(
    first,
    "own",
    { kind: "move", moveId: 150 },
    seed,
    "future2",
  );
  assert.equal(getCurrentMovePp(next.opponent!.moves![0]), 4);
  assert.equal(getCurrentMovePp(next.opponent!.moves![1]), 4);
});
test("trainer Teleport retains trainer rules, while wild Teleport ends the encounter", () => {
  const wild = runPlayerActionWithAutomaticOpponent(
    fixture("wild", [100], [150]),
    "own",
    { kind: "move", moveId: 100 },
    seed,
    "escape",
  );
  assert.equal(wild.opponent, null);
  const trainer = runPlayerActionWithAutomaticOpponent(
    fixture("trainer", [100], [150]),
    "own",
    { kind: "move", moveId: 100 },
    seed,
    "stay",
  );
  assert(trainer.opponent);
  assert.equal(trainer.emerald!.ended, false);
  assert.equal(trainer.battleField!.turn, 2);
});
test("paid native item plan contains one automatic response without changing Bag or source", async () => {
  for (const item of ["full-restore", "max-ether", "max-elixir"] as const) {
    const input = fixture("trainer", [33, 150], [150]);
    input.pokemons[0].pokemon.stats.find((stat) => stat.name === "hp")!.value -=
      20;
    input.pokemons[0].moves![0].currentPp = 0;
    const original = clone(input);
    const plan = await preparePartyItem(
      input,
      "own",
      item,
      item === "max-ether" ? 33 : undefined,
    );
    assert.equal(plan.battleField!.turn, 2);
    assert.equal(getCurrentMovePp(plan.opponent!.moves![0]), 4);
    assert.equal(
      getCurrentMovePp(plan.pokemons[0].moves![1]),
      item === "max-elixir" ? getMaxMovePp(plan.pokemons[0].moves![1]) : 5,
    );
    assert.equal(
      item === "full-restore"
        ? getCurrentHp(plan.pokemons[0].pokemon)
        : getCurrentMovePp(plan.pokemons[0].moves![0]),
      item === "full-restore"
        ? getMaxHp(plan.pokemons[0].pokemon)
        : getMaxMovePp(plan.pokemons[0].moves![0]),
    );
    assert.deepEqual(plan.bag, input.bag);
    assert.deepEqual(input, original);
    assert.equal(combatKey(clone(plan)), combatKey(plan));
    assert.deepEqual(plan.emerald!.pending, {});
  }
});
test("legacy manual commands and public opponent submissions cannot bypass automatic policy", async () => {
  const input = fixture("trainer");
  assert.equal(
    reducer(
      input,
      executePokemonMove({
        captureId: "own",
        moveId: 33,
        commandId: "raw",
        expectedContext: "raw",
        conditionsConfirmed: true,
      }),
    ),
    input,
  );
  assert.equal(
    reducer(
      input,
      finishBattleTurn({
        captureId: "own",
        expectedContext: "raw",
        expectedTurn: 1,
      }),
    ),
    input,
  );
  await assert.rejects(
    () =>
      submitEmeraldAction("own", "opponent", { kind: "move", moveId: 33 })(
        (() => undefined) as unknown as AppDispatch,
        () => ({ party: input }) as RootState,
      ),
    /automáticamente/,
  );
});
test("catalog accepts legacy absence and booleans, rejecting truthy non-booleans", () => {
  const catalog = {
    revision: 1,
    prices: Object.fromEntries(SHOP_ITEM_IDS.map((item) => [item, 10])),
  };
  assert(validShopCatalog(catalog));
  assert(validShopCatalog({ ...catalog, automaticOpponents: false }));
  assert(validShopCatalog({ ...catalog, automaticOpponents: true }));
  for (const value of [0, 1, "true", null, {}, []])
    assert.equal(
      validShopCatalog({ ...catalog, automaticOpponents: value }),
      false,
    );
});
