import assert from "node:assert/strict";
import { test } from "node:test";
import { Dex } from "@pkmn/sim";
import {
  runEmeraldAction,
  emeraldMoves,
  cancelEmeraldChoice,
} from "../src/lib/emerald/engine";
import {
  createLeveledPokemon,
  getCurrentHp,
  getMaxHp,
  neutralBattleStages,
} from "../src/lib/pokemonStats";
import { emptyBattleField } from "../src/lib/battleField";
import type { CombatState, EmeraldChoice } from "../src/lib/emerald/types";
import type { LearnedMove } from "../src/types/moves";
const seed: [number, number, number, number] = [1, 2, 3, 4];
const dex = Dex.forGen(3);
function move(id: number): LearnedMove {
  const m = emeraldMoves.find((m) => m.num === id)!;
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
function mon(name: string) {
  const s = dex.species.get(name);
  const keys = [
    "hp",
    "attack",
    "defense",
    "special-attack",
    "special-defense",
    "speed",
  ];
  return createLeveledPokemon(
    {
      id: s.num,
      name: s.id,
      image: null,
      types: s.types.map((t) => t.toLowerCase()),
      stats: Object.values(s.baseStats).map((value, i) => ({
        name: keys[i],
        value,
      })),
    },
    undefined,
    50,
  );
}
export function fixture(
  own: number[] = [33],
  foe: number[] = [150],
): CombatState {
  const field = emptyBattleField();
  field.activeCaptureId = "own";
  return {
    pokemons: [
      {
        captureId: "own",
        pokemon: mon("Snorlax"),
        moves: own.map(move),
        statuses: [],
      },
      {
        captureId: "bench",
        pokemon: mon("Blissey"),
        moves: [move(33)],
        statuses: [],
      },
    ],
    opponent: {
      pokemon: mon("Snorlax"),
      kind: "wild",
      encounterId: "wild-1",
      moves: foe.map(move),
      stages: neutralBattleStages(),
      statuses: [],
    },
    battleField: field,
  };
}
function choose(
  s: CombatState,
  side: "player" | "opponent",
  id: number | EmeraldChoice,
) {
  return runEmeraldAction(
    s,
    s.battleField!.activeCaptureId!,
    side,
    typeof id === "number" ? { kind: "move", moveId: id } : id,
    seed,
    `${s.emerald?.serial ?? 0}-${side}`,
  );
}
function turn(
  s: CombatState,
  own: number | EmeraldChoice,
  foe: number | EmeraldChoice,
) {
  const a = choose(s, "player", own);
  return choose(a, "opponent", foe);
}
test("354 unique Gen III moves are implemented by the simulator", () => {
  assert.equal(emeraldMoves.length, 354);
  assert.equal(new Set(emeraldMoves.map((m) => m.num)).size, 354);
});
test("first choice does not deal damage; second resolves and closes one turn", () => {
  const s = fixture();
  const a = choose(s, "player", 33);
  assert.equal(
    getCurrentHp(a.opponent!.pokemon),
    getCurrentHp(s.opponent!.pokemon),
  );
  assert.equal(a.battleField!.turn, 1);
  assert(a.emerald!.pending.player);
  const b = choose(JSON.parse(JSON.stringify(a)), "opponent", 150);
  assert.equal(b.battleField!.turn, 2);
  assert(getCurrentHp(b.opponent!.pokemon) < getCurrentHp(s.opponent!.pokemon));
  assert.equal(Object.keys(b.emerald!.pending).length, 0);
  assert.equal(b.results.length, 2);
});
test("cancel and duplicate submission do not damage or advance", () => {
  const s = choose(fixture(), "player", 33);
  assert.throws(() => choose(s, "player", 33), /ya eligió/);
  const c = cancelEmeraldChoice(s, "player");
  assert(!c.emerald!.pending.player);
  assert.equal(c.battleField!.turn, 1);
  assert(choose(c, "player", 33).emerald!.pending.player);
});
test("Dream Eater requires sleep and heals half actual damage", () => {
  let s = fixture([138]);
  s.pokemons[0].pokemon.stats[0].value = 40;
  let r = turn(s, 138, 150);
  assert.equal(
    getCurrentHp(r.opponent!.pokemon),
    getCurrentHp(s.opponent!.pokemon),
  );
  assert.equal(getCurrentHp(r.pokemons[0].pokemon), 40);
  s = fixture([138]);
  s.pokemons[0].pokemon.stats[0].value = 40;
  s.opponent!.statuses = ["asleep"];
  s.opponent!.statusTurns = { asleep: 6 };
  s.opponent!.pokemon.stats[0].value = 10;
  r = turn(s, 138, 150);
  assert.equal(getCurrentHp(r.opponent!.pokemon), 0);
  assert.equal(getCurrentHp(r.pokemons[0].pokemon), 45);
});
test("Snore/Sleep Talk work only asleep and Sleep Talk calls a known move", () => {
  let s = fixture([173, 214, 33]);
  let r = turn(s, 173, 150);
  assert.equal(
    getCurrentHp(r.opponent!.pokemon),
    getCurrentHp(s.opponent!.pokemon),
  );
  s = fixture([173, 214, 33]);
  s.pokemons[0].statuses = ["asleep"];
  s.pokemons[0].statusTurns = { asleep: 6 };
  r = turn(s, 214, 150);
  assert(getCurrentHp(r.opponent!.pokemon) < getCurrentHp(s.opponent!.pokemon));
});
test("Fly spends preparation turn, avoids Tackle and automatically continues next turn", () => {
  const s = fixture([19], [33]);
  s.pokemons[0].pokemon.stats.find((s) => s.name === "speed")!.value = 300;
  const r = turn(s, 19, 33);
  assert.equal(
    getCurrentHp(r.opponent!.pokemon),
    getCurrentHp(s.opponent!.pokemon),
  );
  assert.equal(
    getCurrentHp(r.pokemons[0].pokemon),
    getCurrentHp(s.pokemons[0].pokemon),
  );
  assert(r.emerald!.requests.player.locked);
  const next = choose(JSON.parse(JSON.stringify(r)), "opponent", 33);
  assert.equal(next.battleField!.turn, 3);
  assert(
    getCurrentHp(next.opponent!.pokemon) < getCurrentHp(r.opponent!.pokemon),
  );
  assert(!next.emerald!.requests.player.locked);
});
test("Solar Beam uses one turn in sun; Hyper Beam requires recharge", () => {
  let s = fixture([76]);
  s.battleField!.weather = { kind: "sun", turnsLeft: 5 };
  let r = turn(s, 76, 150);
  assert(getCurrentHp(r.opponent!.pokemon) < getCurrentHp(s.opponent!.pokemon));
  assert(!r.emerald!.requests.player.locked);
  s = fixture([63]);
  r = turn(s, 63, 150);
  assert(r.emerald!.requests.player.locked);
  const next = choose(r, "opponent", 150);
  assert.equal(next.battleField!.turn, 3);
  assert.equal(
    getCurrentHp(next.opponent!.pokemon),
    getCurrentHp(r.opponent!.pokemon),
  );
});
test("poison/burn and weather apply once per turn to both sides", () => {
  const s = fixture([150]);
  s.pokemons[0].statuses = ["burned"];
  s.opponent!.statuses = ["poisoned"];
  s.battleField!.weather = { kind: "sand", turnsLeft: 2 };
  const max = getMaxHp(s.pokemons[0].pokemon)!;
  const r = turn(s, 150, 150);
  assert.equal(
    getCurrentHp(r.pokemons[0].pokemon),
    max - Math.floor(max / 8) - Math.floor(max / 16),
  );
  assert.equal(
    getCurrentHp(r.opponent!.pokemon),
    max - Math.floor(max / 8) - Math.floor(max / 16),
  );
  assert.equal(r.battleField!.weather?.turnsLeft, 1);
  const next = turn(r, 150, 150);
  assert.equal(next.battleField!.weather, null);
});
test("Toxic escalates; Leech Seed transfers real HP", () => {
  const s = fixture([150]);
  s.pokemons[0].statuses = ["badly-poisoned"];
  const max = getMaxHp(s.pokemons[0].pokemon)!;
  const a = turn(s, 150, 150);
  const b = turn(a, 150, 150);
  assert.equal(
    getCurrentHp(a.pokemons[0].pokemon) - getCurrentHp(b.pokemons[0].pokemon),
    Math.floor(max / 16) * 2,
  );
  const c = fixture([73]);
  c.pokemons[0].pokemon.stats[0].value = 50;
  const d = turn(c, 73, 150);
  assert(getCurrentHp(d.pokemons[0].pokemon) > 50);
  assert(d.opponent!.statuses!.includes("leech-seed"));
});
test("priority wins over speed; slower Pokémon cannot act after fainting", () => {
  const s = fixture([98], [33]);
  s.pokemons[0].pokemon.stats.find((s) => s.name === "speed")!.value = 1;
  s.opponent!.pokemon.stats[0].value = 1;
  const r = turn(s, 98, 33);
  assert.equal(getCurrentHp(r.opponent!.pokemon), 0);
  assert.equal(r.results.filter((x) => x.actorSide === "opponent").length, 0);
});
test("manual HP/stage/weather corrections sync without dropping first choice", () => {
  let s = choose(fixture([33]), "player", 33);
  s.opponent!.pokemon.stats[0].value = 5;
  s.battleField!.weather = { kind: "rain", turnsLeft: 3 };
  const r = choose(s, "opponent", 150);
  assert.equal(getCurrentHp(r.opponent!.pokemon), 0);
  assert.equal(r.battleField!.weather?.kind, "rain");
});
test("switch is an action, clears volatiles and preserves poison", () => {
  const s = fixture();
  s.pokemons[0].statuses = ["poisoned", "confused"];
  s.pokemons[0].statusTurns = { confused: 3 };
  let r = turn(s, { kind: "switch", captureId: "bench" }, 150);
  assert.equal(r.battleField!.activeCaptureId, "bench");
  const old = r.pokemons.find((p) => p.captureId === "own")!;
  assert.deepEqual(old.statuses, ["poisoned"]);
});
test("trainer combat is never routed to automatic engine", () => {
  const s = fixture();
  s.opponent!.kind = "trainer";
  assert.throws(() => choose(s, "player", 33), /solo.*salvajes/);
});
test("all 354 moves execute a complete legal turn without manual verification or exceptions", () => {
  for (const m of emeraldMoves) {
    const s = fixture([m.num]);
    try {
      const r = turn(s, m.num, 150);
      assert(r.emerald || !r.opponent);
      assert(r.results.every((x) => x.outcome !== "manual"));
    } catch (e) {
      throw new Error(`${m.num} ${m.name}: ${(e as Error).stack}`);
    }
  }
});
test("Counter uses actual physical damage received in the same turn", () => {
  const s = fixture([68], [33]);
  s.pokemons[0].pokemon.stats.find((s) => s.name === "speed")!.value = 1;
  const r = turn(s, 68, 33);
  const received =
    getCurrentHp(s.pokemons[0].pokemon) - getCurrentHp(r.pokemons[0].pokemon);
  assert(received > 0);
  assert.equal(
    getCurrentHp(s.opponent!.pokemon) - getCurrentHp(r.opponent!.pokemon),
    received * 2,
  );
});
test("Baton Pass pauses for a replacement and passes stages before finishing the turn", () => {
  const s = fixture([226]);
  s.pokemons[0].pokemon.battleStages!.attack = 2;
  s.pokemons[0].pokemon.stats.find((s) => s.name === "speed")!.value = 300;
  const a = turn(s, 226, 150);
  assert(a.emerald!.requests.player.forceSwitch);
  const b = choose(JSON.parse(JSON.stringify(a)), "player", {
    kind: "switch",
    captureId: "bench",
  });
  assert.equal(b.battleField!.activeCaptureId, "bench");
  assert.equal(b.pokemons[1].pokemon.battleStages!.attack, 2);
  assert.equal(b.battleField!.turn, 2);
});
test("Perish Song counts down to fainting, no manual HP adjustment", () => {
  let s: CombatState = fixture([195, 150]);
  s = turn(s, 195, 150);
  assert(s.pokemons[0].statuses!.includes("perish-song"));
  for (let i = 0; i < 3; i++) s = turn(s, 150, 150);
  assert.equal(getCurrentHp(s.pokemons[0].pokemon), 0);
  assert.equal(getCurrentHp(s.opponent!.pokemon), 0);
});
test("fainted active requests a legal replacement, without consuming a second turn", () => {
  const s = fixture([150], [33]);
  s.pokemons[0].pokemon.stats[0].value = 1;
  const r = turn(s, 150, 33);
  assert(r.emerald!.requests.player.forceSwitch);
  const replacement = choose(r, "player", {
    kind: "switch",
    captureId: "bench",
  });
  assert.equal(replacement.battleField!.activeCaptureId, "bench");
  assert.equal(replacement.battleField!.turn, 2);
});
test("Substitute spends HP and absorbs attacks; Protect prevents direct damage", () => {
  const s = fixture([164], [33]);
  s.pokemons[0].pokemon.stats.find((s) => s.name === "speed")!.value = 300;
  const max = getMaxHp(s.pokemons[0].pokemon)!;
  const r = turn(s, 164, 33);
  assert.equal(getCurrentHp(r.pokemons[0].pokemon), max - Math.floor(max / 4));
  const t = fixture([182], [33]);
  const u = turn(t, 182, 33);
  assert.equal(
    getCurrentHp(u.pokemons[0].pokemon),
    getCurrentHp(t.pokemons[0].pokemon),
  );
});
test("attack result excludes poison/weather residual HP changes", () => {
  const s = fixture([33], [150]);
  s.pokemons[0].statuses = ["poisoned"];
  const r = turn(s, 33, 150);
  const result = r.results.find((x) => x.actorSide === "player")!;
  assert(!result.hpChanges?.some((c) => c.role === "attacker"));
  assert(r.events.some((e) => e.includes("psn")));
});
test("PP persist between turns and depleted moves are disabled", () => {
  let s: CombatState = fixture([180], [150]);
  for (let i = 0; i < 10; i++) s = turn(s, 180, 150);
  const req = s.emerald!.requests.player;
  assert(req.moves.some((m) => m.id === 165)); // Struggle
  assert.throws(() => choose(s, "player", 180), /no está disponible/);
});
test("21-character capture IDs remain intact in logs and damage accounting", () => {
  const s = fixture();
  s.pokemons[0].captureId = "012345678901234567890";
  s.battleField!.activeCaptureId = s.pokemons[0].captureId;
  const r = turn(s, 33, 150);
  const result = r.results.find((r) => r.actorSide === "player")!;
  assert.equal(result.attackerName, "snorlax");
  assert.equal(result.captureId, s.pokemons[0].captureId);
  assert(result.damage > 0);
});
test("Teleport ends a wild encounter; trapping prevents escape", () => {
  let s = fixture([100]);
  let r = turn(s, 100, 150);
  assert.equal(r.opponent, null);
  assert(r.events.some((e) => e.includes("huida")));
  s = fixture([100]);
  s.pokemons[0].statuses = ["trapped"];
  r = turn(s, 100, 150);
  assert(r.opponent);
  assert(!r.emerald!.ended);
});
test("Roar ends a wild encounter instead of switching a trainer bench", () => {
  const r = turn(fixture([46]), 46, 150);
  assert.equal(r.opponent, null);
  assert.equal(r.pokemons.length, 2);
});
import reducer, {
  commitEmeraldAction,
  captureWildOpponent,
  setBattleOpponent,
  resetGame,
  finishBattleTurn,
  type PartyState,
} from "../src/slices/partySlice";
import { combatKey } from "../src/lib/emerald/types";
import { battleContextKey } from "../src/lib/battleEngine";
test("Redux commits both move results plus turn log; rejects stale/double commit", () => {
  let state: PartyState = {
    ...reducer(undefined, { type: "init" }),
    ...fixture(),
  };
  const first = choose(state, "player", 33);
  const a = commitEmeraldAction({
    expected: combatKey(state),
    update: first,
    id: "command-1",
  });
  state = reducer(state, a);
  assert.equal(state.activityHistory?.length, 1);
  const second = choose(state, "opponent", 150);
  const command = commitEmeraldAction({
    expected: combatKey(state),
    update: second,
    id: "command-2",
  });
  state = reducer(state, command);
  assert(state.lastMovesByPlayer?.own);
  assert(state.lastOpponentMove);
  assert.equal(state.activityHistory?.length, 4);
  assert.equal(state.battleField?.turn, 2);
  assert.equal(reducer(state, command), state);
  assert.equal(reducer(state, a), state);
  const before = JSON.stringify(state);
  state = reducer(
    state,
    finishBattleTurn({
      captureId: "own",
      expectedTurn: 2,
      expectedContext: battleContextKey(
        state.pokemons[0],
        state.opponent!,
        state.battleField,
      ),
    }),
  );
  assert.equal(JSON.stringify(state), before);
});
test("physical capture preserves moves/level/primary status and clears engine/secondary conditions", () => {
  let s: PartyState = {
    ...reducer(undefined, { type: "init" }),
    ...fixture(),
    starterClaimed: true,
    gameSettings: {
      version: 1,
      regions: ["kanto"],
      ruleset: "rse-emerald",
      startingLevel: 50,
      hpMultiplier: 1.3,
    },
  };
  s.opponent!.pokemon.learnset = {
    versionGroup: "emerald",
    moves: [{ id: 150, name: "splash" }],
  };
  s.opponent!.statuses = ["poisoned", "confused"];
  s.opponent!.statusTurns = { confused: 6 };
  const a = choose(s, "player", 33);
  s = reducer(
    s,
    commitEmeraldAction({ expected: combatKey(s), update: a, id: "queued" }),
  );
  const level = s.opponent!.pokemon.level;
  s = reducer(s, captureWildOpponent("wild-1"));
  assert.equal(s.pokemons.length, 3);
  assert.equal(s.opponent, null);
  assert.equal(s.emerald, undefined);
  const captured = s.pokemons[2];
  assert.deepEqual(captured.statuses, ["poisoned"]);
  assert.equal(captured.pokemon.level, level);
  assert.equal(captured.moves?.[0].id, 150);
  assert(s.activityHistory?.some((a) => a.kind === "capture"));
});
test("removing/replacing rival or resetting game cannot resurrect queued engine state", () => {
  let s: PartyState = { ...reducer(undefined, { type: "init" }), ...fixture() };
  let u = choose(s, "player", 33);
  s = reducer(
    s,
    commitEmeraldAction({ expected: combatKey(s), update: u, id: "queued" }),
  );
  const removed = reducer(s, setBattleOpponent(null));
  assert(!removed.emerald);
  assert(!removed.opponent);
  const trainer = reducer(
    s,
    setBattleOpponent({ ...s.opponent!, kind: "trainer" }),
  );
  assert(!trainer.emerald);
  assert(!reducer(s, resetGame()).emerald);
});

test("Dig/Fly avoid ordinary attacks while preparing, on either side after reload", () => {
  for (const id of [91, 19])
    for (const side of ["player", "opponent"] as const) {
      const s = fixture(
        side === "player" ? [id] : [33],
        side === "opponent" ? [id] : [33],
      );
      const p = side === "player" ? s.pokemons[0].pokemon : s.opponent!.pokemon;
      p.stats.find((s) => s.name === "speed")!.value = 300;
      const before = getCurrentHp(p);
      const queued = choose(s, side, id);
      const r = choose(
        JSON.parse(JSON.stringify(queued)),
        side === "player" ? "opponent" : "player",
        33,
      );
      assert.equal(
        getCurrentHp(
          side === "player" ? r.pokemons[0].pokemon : r.opponent!.pokemon,
        ),
        before,
        `${id}/${side}`,
      );
    }
});

test("Dig Earthquake/Magnitude and Fly Gust/Twister receive double damage; Thunder/Sky Uppercut can hit", () => {
  for (const [charge, attack] of [
    [91, 89],
    [91, 222],
    [19, 16],
    [19, 239],
    [19, 87],
    [19, 327],
  ]) {
    const s = fixture([charge, 150], [attack]);
    s.pokemons[0].pokemon.stats.find((s) => s.name === "speed")!.value = 300;
    s.pokemons[0].pokemon.stats.find((s) => s.name === "defense")!.value = 200;
    s.pokemons[0].pokemon.stats.find(
      (s) => s.name === "special-defense",
    )!.value = 200;
    const normal = turn(JSON.parse(JSON.stringify(s)), 150, attack);
    const hidden = turn(JSON.parse(JSON.stringify(s)), charge, attack);
    const hp = getCurrentHp(s.pokemons[0].pokemon);
    const a = hp - getCurrentHp(normal.pokemons[0].pokemon),
      b = hp - getCurrentHp(hidden.pokemons[0].pokemon);
    assert(a > 0 && b > 0, `${charge}/${attack}: ${a}/${b}`);
    if ([89, 222, 16, 239].includes(attack))
      assert(Math.abs(b - 2 * a) <= 2, `${charge}/${attack}: ${a}/${b}`);
    else assert.equal(b, a, `${charge}/${attack}: no extra damage`);
  }
});
test("Dig/Fly can be hit before preparing and after emerging, not while still hidden", () => {
  for (const id of [91, 19]) {
    let s = fixture([id], [33]);
    s.pokemons[0].pokemon.stats.find((s) => s.name === "speed")!.value = 1;
    const r = turn(s, id, 33);
    assert(
      getCurrentHp(r.pokemons[0].pokemon) < getCurrentHp(s.pokemons[0].pokemon),
    );
    const next = choose(JSON.parse(JSON.stringify(r)), "opponent", 33);
    assert.equal(
      getCurrentHp(next.pokemons[0].pokemon),
      getCurrentHp(r.pokemons[0].pokemon),
    );
    s = fixture([id], [33]);
    s.pokemons[0].pokemon.stats.find((s) => s.name === "speed")!.value = 300;
    const first = turn(s, id, 33);
    const second = choose(JSON.parse(JSON.stringify(first)), "opponent", 33);
    assert(
      getCurrentHp(second.pokemons[0].pokemon) <
        getCurrentHp(first.pokemons[0].pokemon),
    );
  }
});
