import assert from "node:assert/strict";
import { test } from "node:test";
import reducer, {
  learnInitialMove,
  type PartyState,
} from "../src/slices/partySlice";
import { prepareTmParty } from "../src/lib/fullRestorePlan";
import { createLeveledPokemon, neutralBattleStages } from "../src/lib/pokemonStats";
import { trainerMoves } from "../src/lib/trainerBattle/catalog";
import { validItemUse } from "../src/lib/shop/itemUse";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function fixture(): PartyState {
  const stats = [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ].map((name) => ({ name, value: 50 }));
  return {
    ...reducer(undefined, { type: "init" }),
    pokemons: [
      {
        captureId: "tm-own",
        origin: "wild",
        statuses: ["poisoned"],
        statusTurns: {},
        pokemon: {
          ...createLeveledPokemon(
            { id: 35, name: "clefairy", image: null, types: ["normal"], stats },
            stats,
            20,
          ),
          learnset: {
            versionGroup: "emerald",
            moves: [
              { id: 33, name: "tackle" },
              { id: 150, name: "splash" },
            ],
          },
        },
        moves: [
          {
            ...clone(trainerMoves.find((move) => move.id === 33)!),
            currentPp: 0,
          },
        ],
      },
    ],
    opponent: null,
  };
}
const splash = () => ({
  ...clone(trainerMoves.find((move) => move.id === 150)!),
  currentPp: 0,
});

test("a TM draft learns exactly its compatible move at full PP, preserving Bag and existing resources", async () => {
  const initial = fixture(),
    before = clone(initial);
  const next = await prepareTmParty(initial, "tm-own", splash());
  assert.deepEqual(initial, before);
  assert.equal(next.pokemons[0].moves![0].currentPp, 0);
  assert.equal(next.pokemons[0].moves![1].currentPp, 40);
  assert.equal(next.pokemons[0].moves![1].source, "tm");
  assert.deepEqual(next.bag, initial.bag);
  assert.deepEqual(next.pokemons[0].pokemon, initial.pokemons[0].pokemon);
  assert.deepEqual(next.pokemons[0].statuses, initial.pokemons[0].statuses);
  assert.equal(next.activityHistory![0].kind, "tm");
  await assert.rejects(
    prepareTmParty(next, "tm-own", splash()),
    /compatibilidad/,
  );
});

test("TM plans reject incompatible or missing targets, locks and active native/legacy encounters", async () => {
  const initial = fixture();
  await assert.rejects(prepareTmParty(initial, "other", splash()), /equipo/);
  await assert.rejects(
    prepareTmParty(initial, "tm-own", { ...splash(), id: 46 }),
    /compatibilidad/,
  );
  await assert.rejects(
    prepareTmParty(initial, "tm-own", { ...splash(), id: 355 }),
    /compatibilidad/,
  );
  for (const lock of [
    "pvpLock",
    "shopLock",
    "resetLock",
    "itemUseLock",
  ] as const)
    await assert.rejects(
      prepareTmParty({ ...initial, [lock]: {} }, "tm-own", splash()),
      /pendiente/,
    );
  for (const kind of ["wild", "trainer"] as const)
    await assert.rejects(
      prepareTmParty(
        {
          ...initial,
          opponent: {
            kind,
            pokemon: initial.pokemons[0].pokemon,
            statuses: [],
          stages: neutralBattleStages(),
          },
        },
        "tm-own",
        splash(),
      ),
      /fuera de combate/,
    );
  await assert.rejects(
    prepareTmParty(
      { ...initial, emerald: { ended: false } as PartyState["emerald"] },
      "tm-own",
      splash(),
    ),
    /fuera de combate/,
  );
});

test("TM receipt validation binds its learned move and rejects battle context", () => {
  const receipt = {
    requestId: "tm-request",
    userId: 1,
    clientId: "tm-client",
    itemId: "tm",
    captureId: "tm-own",
    moveId: 150,
    context: "party",
    planHash: "a".repeat(64),
    expectedWalletRevision: 1,
    walletRevision: 2,
    status: "pending",
  };
  assert.equal(validItemUse(receipt), true);
  for (const bad of [
    { moveId: undefined },
    { moveId: 0 },
    { moveId: 355 },
    { context: "local-battle" },
  ])
    assert.equal(validItemUse({ ...receipt, ...bad }), false);
});

test("TM replacement preserves the two free starter choices, other PP and the four-move limit", async () => {
  const initial = fixture(),
    capture = initial.pokemons[0];
  capture.origin = "starter";
  capture.initialMovesChosen = 2;
  capture.moves = [33, 45, 52, 55].map((id, index) => ({
    ...clone(trainerMoves.find((move) => move.id === id)!),
    currentPp: 0,
    source: index < 2 ? ("starter" as const) : ("tm" as const),
  }));
  await assert.rejects(
    prepareTmParty(initial, capture.captureId, splash()),
    /compatibilidad/,
  );
  await assert.rejects(
    prepareTmParty(initial, capture.captureId, splash(), 99),
    /compatibilidad/,
  );
  const learned = await prepareTmParty(
    initial,
    capture.captureId,
    splash(),
    33,
  );
  assert.equal(learned.pokemons[0].moves!.length, 4);
  assert.equal(learned.pokemons[0].moves![0].id, 150);
  assert.equal(learned.pokemons[0].moves![0].currentPp, 40);
  assert.deepEqual(learned.pokemons[0].moves!.slice(1), capture.moves.slice(1));
  assert.equal(learned.pokemons[0].initialMovesChosen, 2);
  const afterReplacement = clone(learned);
  afterReplacement.pokemons[0].moves = afterReplacement.pokemons[0].moves!.slice(0, 3);
  afterReplacement.pokemons[0].pokemon.learnset!.moves.push({ id: 46, name: "roar" });
  assert.equal(
    reducer(
      afterReplacement,
      learnInitialMove({
        captureId: capture.captureId,
        move: clone(trainerMoves.find((move) => move.id === 46)!),
      }),
    ),
    afterReplacement,
  );
});

test("the two free initial choices remain independent from TM stock and cannot be chosen in combat", () => {
  const initial = fixture();
  initial.pokemons[0].origin = "starter";
  initial.pokemons[0].moves = [];
  const first = reducer(
    initial,
    learnInitialMove({ captureId: "tm-own", move: splash() }),
  );
  assert.equal(first.pokemons[0].initialMovesChosen, 1);
  assert.equal(first.bag?.items?.tm ?? 0, 0);
  assert.equal(first.pokemons[0].moves![0].currentPp, 40);
  const nextMove = clone(trainerMoves.find((move) => move.id === 33)!);
  const second = reducer(
    first,
    learnInitialMove({ captureId: "tm-own", move: nextMove }),
  );
  assert.equal(second.pokemons[0].initialMovesChosen, 2);
  const battle = {
    ...initial,
    opponent: {
      kind: "wild" as const,
      pokemon: initial.pokemons[0].pokemon,
      statuses: [],
      stages: neutralBattleStages(),
    },
  };
  assert.equal(
    reducer(battle, learnInitialMove({ captureId: "tm-own", move: splash() })),
    battle,
  );
});
