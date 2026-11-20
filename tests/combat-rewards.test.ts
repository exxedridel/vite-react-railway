import assert from "node:assert/strict";
import { test } from "node:test";
import { Battle } from "@pkmn/sim";
import { trainerMoves, trainerSpecies } from "../src/lib/trainerBattle/catalog";
import { createLeveledPokemon, getCurrentHp, getMaxHp, changeLevel, neutralBattleStages } from "../src/lib/pokemonStats";
import { createTrainerBattleSession, validTrainerBattleSession } from "../src/lib/trainerBattle/model";
import { chooseTrainerAction, forfeitTrainerBattle, startTrainerBattle } from "../src/lib/trainerBattle/engine";
import { pvpTeamPatches } from "../src/lib/pvp/battleAdapter";
import { runPlayerActionWithAutomaticOpponent } from "../src/lib/opponentAutomation";
import { emptyBattleField } from "../src/lib/battleField";
import { prepareAutomaticBallCaptureParty } from "../src/lib/shop/ballCapture";
import { combatKey } from "../src/lib/emerald/types";
import { victoryLevels, rewardedLevel, recordLocalDefeats, finishLocalBattleRewards, validLocalBattleRewards, validCombatRewardLedger } from "../src/lib/battleRewards";
import reducer, { commitEmeraldAction, executePokemonMove, type PartyState } from "../src/slices/partySlice";
import { battleContextKey } from "../src/lib/battleEngine";
import type { CapturedPokemon } from "../src/types/pokemon";
import type { TrainerBattleSession, TrainerChoice } from "../src/lib/trainerBattle/types";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const seed: [number, number, number, number] = [1, 2, 3, 4];
function member(id: string, level = 20, speciesId = 65, moveIds = [94, 150]): CapturedPokemon {
  const species = trainerSpecies.find((entry) => entry.id === speciesId)!;
  return {
    captureId: id,
    pokemon: createLeveledPokemon({
      id: species.id, name: species.name, image: null, types: [...species.types], stats: clone(species.baseStats),
      learnset: { versionGroup: "emerald", moves: moveIds.map((moveId) => ({ id: moveId, name: `move-${moveId}` })) },
    }, undefined, level),
    moves: moveIds.map((moveId) => ({ ...clone(trainerMoves.find((move) => move.id === moveId)!), currentPp: 5 })),
    statuses: [], statusTurns: {},
  };
}
function hurt(capture: CapturedPokemon, hp: number) { capture.pokemon.stats.find((stat) => stat.name === "hp")!.value = hp; }
function setup(a: CapturedPokemon[], b: CapturedPokemon[]): TrainerBattleSession {
  const session = createTrainerBattleSession();
  session.teams.a = { name: "Player", pokemons: a, activeCaptureId: a[0].captureId };
  session.teams.b = { name: "Opponent", pokemons: b, activeCaptureId: b[0].captureId };
  return session;
}
function immediateSetup(a: CapturedPokemon[], b: CapturedPokemon[], eligibleSides: ("a" | "b")[] = ["a"]) {
  const session = setup(a, b);
  session.rewards = { version: 1, timing: "immediate", eligibleSides, appliedCount: 0, defeats: [] };
  return session;
}
function turn(session: TrainerBattleSession, a: TrainerChoice = { kind: "move", moveId: 150 }, b: TrainerChoice = { kind: "move", moveId: 150 }) {
  return chooseTrainerAction(chooseTrainerAction(clone(session), "a", a), "b", b);
}
function local(level = 20, foeLevel = 21, wild = false): PartyState {
  const foe = member("opponent", foeLevel, 35, [150]);
  hurt(foe, 1);
  return {
    ...reducer(undefined, { type: "test/init" }),
    starterClaimed: true,
    gameSettings: { version: 1, ruleset: "rse-emerald", regions: ["kanto"], startingLevel: 5, hpMultiplier: 1.3 },
    pokemons: [member("own", level)],
    bag: { ...reducer(undefined, { type: "test/init" }).bag!, items: { "great-ball": 1 } },
    opponent: {
      kind: wild ? "wild" : "trainer", encounterId: "local-reward-encounter", pokemon: foe.pokemon,
      statuses: [], moves: foe.moves, stages: neutralBattleStages(), automation: { enabled: true, catalogRevision: 0 },
    },
    battleField: { ...emptyBattleField(), activeCaptureId: "own" },
  };
}
function resolve(party: PartyState, id = "reward-turn") {
  const update = runPlayerActionWithAutomaticOpponent(party, "own", { kind: "move", moveId: 94 }, seed, id);
  return { update, party: reducer(party, commitEmeraldAction({ expected: combatKey(party), update, id })) };
}

test("victory rewards compare levels and cap the result at 100", () => {
  assert.equal(victoryLevels(20, 19), 1);
  assert.equal(victoryLevels(20, 20), 1);
  assert.equal(victoryLevels(20, 21), 2);
  assert.equal(rewardedLevel(99, 2), 100);
  assert.equal(rewardedLevel(100, 2), 100);
});
for (const foeLevel of [19, 20, 21]) test(`native local victory against level ${foeLevel} earns its levels only with the final checked turn`, () => {
  const before = local(20, foeLevel);
  hurt(before.pokemons[0], 20);
  const expected = changeLevel(before.pokemons[0].pokemon as ReturnType<typeof createLeveledPokemon>, 20 + victoryLevels(20, foeLevel));
  const result = resolve(before);
  assert.equal(before.pokemons[0].pokemon.level, 20);
  assert.equal(result.update.pokemons[0].pokemon.level, 20, "engine combat stats stay frozen");
  assert.equal(result.update.battleOutcome, "win");
  assert.equal(result.party.pokemons[0].pokemon.level, expected.level);
  assert.equal(getCurrentHp(result.party.pokemons[0].pokemon), getCurrentHp(expected));
  assert.equal(result.party.pokemons[0].moves![0].currentPp, 4);
  assert.equal(result.party.localBattleRewards!.appliedCount, 1);
  assert(validLocalBattleRewards(result.party.localBattleRewards));
  assert.deepEqual(reducer(result.party, commitEmeraldAction({ expected: combatKey(before), update: result.update, id: "reward-turn" })), result.party);
});
test("level 99 earning two reaches 100 without healing status or resetting PP", () => {
  const party = local(99, 100);
  party.pokemons[0].statuses = ["poisoned"];
  const next = resolve(party).party;
  assert.equal(next.pokemons[0].pokemon.level, 100);
  assert(next.pokemons[0].statuses!.includes("poisoned"));
  assert.equal(next.pokemons[0].moves![0].currentPp, 4);
});
test("saved reward ledger does not apply the same event twice or revive a fainted recipient", () => {
  const party = local();
  hurt(party.pokemons[0], 0);
  const event = { id: "ko", winnerSide: "a" as const, winnerCaptureId: "own", defeatedSide: "b" as const, defeatedCaptureId: "opponent", winnerLevel: 20, defeatedLevel: 21, levels: 2 as const };
  recordLocalDefeats(party, [event, event]);
  finishLocalBattleRewards(party);
  assert.equal(party.pokemons[0].pokemon.level, 22);
  assert.equal(getCurrentHp(party.pokemons[0].pokemon), 0);
  const restored = clone(party);
  recordLocalDefeats(restored, [event]);
  finishLocalBattleRewards(restored);
  assert.deepEqual(restored, party);
});
test("invalid or duplicate ledger events are rejected", () => {
  assert.equal(validLocalBattleRewards({ version: 1, encounterId: "x", defeats: [], appliedCount: 1 }), false);
  assert.equal(validCombatRewardLedger({ version: 1, defeats: [{ id: "x" }] }), false);
});
test("wild capture rewards the selected active Pokemon and preserves the captured level", async () => {
  const party = local(20, 21, true);
  party.pokemons.unshift(member("bench", 70));
  const result = await prepareAutomaticBallCaptureParty(party, "own", "great-ball",
    { userId: 2, clientId: "reward-browser", requestId: "reward-capture" }, seed, "captured", undefined,
    { captureDifficulty: 0, captureRevision: 0 }, () => 20);
  assert.equal(result.lastCaptureResult!.outcome, "caught");
  assert.equal(result.pokemons.find((capture) => capture.captureId === "own")!.pokemon.level, 22);
  assert.equal(result.pokemons.find((capture) => capture.captureId === "bench")!.pokemon.level, 70);
  assert.equal(result.pokemons.find((capture) => capture.captureId === "captured")!.pokemon.level, 21);
  assert.equal(result.localBattleRewards!.appliedCount, 1);
});
test("legacy trainer move KO also awards the actual attacker without a native runtime", () => {
  const party = local(20, 21);
  delete party.opponent!.automation;
  const action = executePokemonMove({ captureId: "own", moveId: 94, commandId: "legacy-reward", conditionsConfirmed: true,
    expectedContext: battleContextKey(party.pokemons[0], party.opponent!, party.battleField) });
  action.payload.rolls = { accuracy: 0, critical: 0.9, extra: Array(64).fill(0.9) };
  const next = reducer(party, action);
  assert.equal(getCurrentHp(next.opponent!.pokemon), 0);
  assert.equal(next.pokemons[0].pokemon.level, 22);
  assert.deepEqual(reducer(next, action), next);
});
test("admin KO ledger freezes levels during battle and emits rewarded final patches", () => {
  const own = member("own", 20), target = member("target", 21, 35, [150]);
  hurt(target, 1);
  let session = startTrainerBattle(setup([own], [target]), seed);
  session = turn(session, { kind: "move", moveId: 94 });
  assert.equal(session.phase, "finished");
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 20);
  assert.equal(session.rewards!.defeats[0].winnerCaptureId, "own");
  assert.equal(session.rewards!.defeats[0].levels, 2);
  assert.equal(pvpTeamPatches(session, "a")[0].level, 22);
  assert.equal(pvpTeamPatches(session, "a")[0].hp, getCurrentHp(changeLevel(own.pokemon as ReturnType<typeof createLeveledPokemon>, 22)));
  assert(validTrainerBattleSession(session));
});
test("forfeit gives no fictional KO reward, and old sessions keep legacy result patches", () => {
  const session = forfeitTrainerBattle(startTrainerBattle(setup([member("own")], [member("other")]), seed), "b");
  assert.equal(session.rewards, undefined);
  assert.equal(pvpTeamPatches(session, "a")[0].level, undefined);
});
test("Future Sight credits its original switched-out attacker", () => {
  const target = member("target", 50, 35, [150]); hurt(target, 1);
  let session = startTrainerBattle(setup([member("source", 50, 65, [248, 150]), member("reserve", 50)], [target]), seed);
  session = turn(session, { kind: "move", moveId: 248 });
  session = turn(session, { kind: "switch", captureId: "reserve" });
  session = turn(clone(session));
  assert.equal(session.phase, "finished");
  assert.equal(session.rewards!.defeats[0].winnerCaptureId, "source");
  assert.equal(session.rewards!.defeats[0].levels, 1);
  assert.equal(pvpTeamPatches(session, "a").find((patch) => patch.captureId === "reserve")!.level, undefined);
});
test("Toxic residual defeat credits the original status source after switching", () => {
  const target = member("target", 50, 35, [150]); hurt(target, 25);
  let session = startTrainerBattle(setup([member("source", 50, 65, [92, 150]), member("reserve", 50)], [target]), seed);
  session = turn(session, { kind: "move", moveId: 92 });
  assert.equal(session.rewards, undefined);
  session = turn(session, { kind: "switch", captureId: "reserve" });
  assert.equal(session.phase, "finished");
  assert.equal(session.rewards!.defeats[0].winnerCaptureId, "source");
});
test("an imported poison with unknown author credits the currently active opponent", () => {
  const target = member("target", 50, 35, [150]); hurt(target, 25); target.statuses = ["poisoned"];
  let session = startTrainerBattle(setup([member("initial", 50), member("active-at-ko", 50)], [target]), seed);
  session = turn(session);
  assert.equal(session.rewards, undefined);
  session = turn(clone(session), { kind: "switch", captureId: "active-at-ko" });
  assert.equal(session.phase, "finished");
  assert.equal(session.rewards!.defeats[0].winnerCaptureId, "active-at-ko");
});
test("a fainted Future Sight source receives its earned levels while remaining fainted", () => {
  const source = member("source", 50, 65, [248, 150]); hurt(source, 1);
  const target = member("target", 50, 35, [129, 150]); hurt(target, 1);
  let session = startTrainerBattle(setup([source, member("reserve", 50)], [target]), seed);
  session = turn(session, { kind: "move", moveId: 248 }, { kind: "move", moveId: 129 });
  assert.equal(getCurrentHp(session.teams.a.pokemons[0].pokemon), 0);
  session = chooseTrainerAction(session, "a", { kind: "switch", captureId: "reserve" });
  for (let i = 0; i < 3 && session.phase !== "finished"; i++) session = turn(clone(session));
  const sourceReward = session.rewards!.defeats.find((reward) => reward.winnerCaptureId === "source")!;
  assert(sourceReward);
  const patch = pvpTeamPatches(session, "a").find((entry) => entry.captureId === "source")!;
  assert.equal(patch.level, 51);
  assert.equal(patch.hp, 0);
});
test("Explosion and double KO preserve the reward event for each side", () => {
  const target = member("target", 20, 35, [150]); hurt(target, 1);
  const session = turn(startTrainerBattle(setup([member("source", 20, 101, [153, 150])], [target]), seed), { kind: "move", moveId: 153 });
  assert.equal(session.rewards!.defeats.length, 2);
  assert.deepEqual(new Set(session.rewards!.defeats.map((event) => event.winnerSide)), new Set(["a", "b"]));
});
test("reviving a victim and defeating it again creates a distinct reward event", () => {
  let session = startTrainerBattle(setup([member("own", 50)], [member("target", 5, 35, [150]), member("reserve", 5, 35, [150])]), seed);
  session = turn(session, { kind: "move", moveId: 94 });
  assert.equal(session.rewards!.defeats.length, 1);
  session = chooseTrainerAction(session, "b", { kind: "switch", captureId: "reserve" });
  session = turn(session, { kind: "move", moveId: 150 }, { kind: "item", item: "full-restore", captureId: "target" });
  session = turn(session, { kind: "move", moveId: 150 }, { kind: "switch", captureId: "target" });
  session = turn(session, { kind: "move", moveId: 94 });
  assert.equal(session.rewards!.defeats.length, 2);
  assert.equal(session.rewards!.defeats[0].defeatedCaptureId, "target");
  assert.equal(session.rewards!.defeats[1].defeatedCaptureId, "target");
  assert.notEqual(session.rewards!.defeats[0].id, session.rewards!.defeats[1].id);
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 50);
  assert.equal(getMaxHp(session.teams.a.pokemons[0].pokemon), getMaxHp(member("own", 50).pokemon));
});
test("immediate human rewards change the next battle action's level and stats and are not added again at finalization", () => {
  const own = member("own", 20);
  hurt(own, 20);
  const first = member("first", 21, 35, [150]); hurt(first, 1);
  const second = member("second", 21, 35, [150]); hurt(second, 1);
  let session = startTrainerBattle(immediateSetup([own], [first, second]), seed);
  session = turn(session, { kind: "move", moveId: 94 });
  assert.equal(session.phase, "battle");
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 22);
  const expectedFirst = changeLevel(own.pokemon as ReturnType<typeof createLeveledPokemon>, 22);
  assert.deepEqual(session.teams.a.pokemons[0].pokemon.stats, expectedFirst.stats);
  let sim = Battle.fromJSON(session.runtime!.engine);
  assert.equal(sim.p1.active[0].level, 22);
  assert.equal(sim.p1.active[0].set.level, 22);
  assert.equal(sim.p1.active[0].hp, getCurrentHp(expectedFirst));
  assert.equal(sim.p1.active[0].maxhp, getMaxHp(expectedFirst));
  assert.equal(sim.p1.active[0].storedStats.spa, expectedFirst.stats.find((stat) => stat.name === "special-attack")!.value);
  assert.equal(session.rewards!.appliedCount, 1);
  assert.equal(session.runtime!.requests.b.forceSwitch, true);
  const saved = clone(session);
  session = chooseTrainerAction(saved, "b", { kind: "switch", captureId: "second" });
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 22);
  session = turn(session, { kind: "move", moveId: 94 });
  assert.equal(session.phase, "finished");
  assert.equal(session.rewards!.defeats[1].winnerLevel, 22);
  assert.equal(session.rewards!.defeats[1].levels, 1, "the next reward compares with the newly earned level");
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 23);
  assert.equal(session.teams.a.pokemons[0].moves![0].currentPp, 3);
  const patch = pvpTeamPatches(session, "a")[0];
  assert.equal(patch.level, 23, "final patch contains the already-earned absolute level");
  assert.equal(patch.hp, getCurrentHp(session.teams.a.pokemons[0].pokemon));
  sim = Battle.fromJSON(session.runtime!.engine);
  assert.equal(sim.p1.active[0].level, 23);
  assert(validTrainerBattleSession(session));
  assert.deepEqual(pvpTeamPatches(clone(session), "a"), [patch]);
});
test("only eligible human sides progress; the NPC keeps its preset level after a real KO", () => {
  const own = member("own", 20, 35, [150]); hurt(own, 1);
  const reserve = member("reserve", 20, 35, [150]);
  let session = startTrainerBattle(immediateSetup([own, reserve], [member("npc", 20)]), seed);
  session = turn(session, { kind: "move", moveId: 150 }, { kind: "move", moveId: 94 });
  assert.equal(session.rewards!.defeats[0].winnerSide, "b");
  assert.equal(session.rewards!.appliedCount, 1);
  assert.equal(session.teams.b.pokemons[0].pokemon.level, 20);
  assert.equal(Battle.fromJSON(session.runtime!.engine).p2.active[0].level, 20);
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 20);
  assert(validTrainerBattleSession(session));
});
test("immediate double KO rewards both human sides without reviving or charging PP again", () => {
  const source = member("source", 20, 101, [153, 150]);
  const target = member("target", 20, 35, [150]); hurt(target, 1);
  const session = turn(startTrainerBattle(immediateSetup([source], [target], ["a", "b"]), seed), { kind: "move", moveId: 153 });
  assert.equal(session.phase, "finished");
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 21);
  assert.equal(session.teams.b.pokemons[0].pokemon.level, 21);
  assert.equal(getCurrentHp(session.teams.a.pokemons[0].pokemon), 0);
  assert.equal(getCurrentHp(session.teams.b.pokemons[0].pokemon), 0);
  assert.equal(pvpTeamPatches(session, "a")[0].level, 21);
  assert.equal(pvpTeamPatches(session, "b")[0].level, 21);
  assert.equal(session.teams.a.pokemons[0].moves![0].currentPp, 4);
  assert.equal(session.rewards!.appliedCount, 2);
});
test("an immediate Hyper Beam KO preserves mandatory recharge and spent PP across JSON reload", () => {
  const source = member("source", 50, 65, [63, 150]);
  const first = member("first", 50, 35, [150]); hurt(first, 1);
  const second = member("second", 50, 35, [150]);
  let session = turn(startTrainerBattle(immediateSetup([source], [first, second]), seed), { kind: "move", moveId: 63 });
  let deferred = turn(startTrainerBattle(setup([clone(source)], [clone(first), clone(second)]), seed), { kind: "move", moveId: 63 });
  assert.deepEqual(JSON.parse(session.runtime!.engine).prng, JSON.parse(deferred.runtime!.engine).prng,
    "applying levels after the same native KO draws no extra randomness");
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 51);
  assert.equal(session.teams.a.pokemons[0].moves![0].currentPp, 4);
  let sim = Battle.fromJSON(session.runtime!.engine);
  assert(sim.p1.active[0].volatiles.mustrecharge);
  session = chooseTrainerAction(clone(session), "b", { kind: "switch", captureId: "second" });
  deferred = chooseTrainerAction(clone(deferred), "b", { kind: "switch", captureId: "second" });
  assert.equal(session.runtime!.requests.a.locked, true);
  session = chooseTrainerAction(clone(session), "b", { kind: "move", moveId: 150 });
  deferred = chooseTrainerAction(clone(deferred), "b", { kind: "move", moveId: 150 });
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 51);
  assert.equal(session.teams.a.pokemons[0].moves![0].currentPp, 4);
  assert.equal(session.rewards!.defeats.length, 1);
  sim = Battle.fromJSON(session.runtime!.engine);
  assert.equal(sim.p1.active[0].volatiles.mustrecharge, undefined);
  assert.deepEqual(JSON.parse(session.runtime!.engine).prng, JSON.parse(deferred.runtime!.engine).prng);
  assert(validTrainerBattleSession(session));
});
test("immediate Future Sight rewards its fainted original source, preserving the forced replacement and HP0", () => {
  const source = member("source", 50, 65, [248, 150]); hurt(source, 1);
  const target = member("target", 50, 35, [129, 150]); hurt(target, 1);
  let session = startTrainerBattle(immediateSetup([source, member("reserve", 50)], [target]), seed);
  session = turn(session, { kind: "move", moveId: 248 }, { kind: "move", moveId: 129 });
  assert.equal(session.runtime!.requests.a.forceSwitch, true);
  assert.equal(session.teams.b.pokemons[0].pokemon.level, 50);
  session = chooseTrainerAction(clone(session), "a", { kind: "switch", captureId: "reserve" });
  for (let i = 0; i < 3 && session.phase !== "finished"; i++) session = turn(clone(session));
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 51);
  assert.equal(getCurrentHp(session.teams.a.pokemons[0].pokemon), 0);
  assert.equal(session.teams.a.pokemons[1].pokemon.level, 50);
  assert.equal(pvpTeamPatches(session, "a")[0].level, 51);
  assert.equal(pvpTeamPatches(session, "a")[0].hp, 0);
  assert(validTrainerBattleSession(session));
});
test("immediate metadata must have unique eligible sides and a fully applied persisted ledger", () => {
  const setupSession = immediateSetup([member("own")], [member("target")]);
  assert(validTrainerBattleSession(setupSession));
  const duplicates = clone(setupSession); duplicates.rewards!.eligibleSides = ["a", "a"];
  assert.equal(validTrainerBattleSession(duplicates), false);
  const count = clone(setupSession); count.rewards!.appliedCount = 1;
  assert.equal(validTrainerBattleSession(count), false);
  const missingSide = clone(setupSession); delete missingSide.rewards!.eligibleSides;
  assert.equal(validTrainerBattleSession(missingSide), false);
});
test("an immediate level-up while transformed preserves copied battle stats, moves, and their remaining PP", () => {
  const source = member("ditto", 20, 132, [144, 150]);
  const first = member("first", 21, 35, [94, 150]); hurt(first, 1);
  const second = member("second", 21, 35, [150]);
  let session = startTrainerBattle(immediateSetup([source], [first, second]), seed);
  session = turn(session, { kind: "move", moveId: 144 });
  const transformedBefore = Battle.fromJSON(session.runtime!.engine).p1.active[0];
  assert.equal(transformedBefore.transformed, true);
  const copiedStats = clone(transformedBefore.storedStats);
  session = turn(clone(session), { kind: "move", moveId: 94 });
  const transformedAfter = Battle.fromJSON(session.runtime!.engine).p1.active[0];
  assert.equal(session.teams.a.pokemons[0].pokemon.level, 22);
  assert.equal(transformedAfter.level, 22);
  assert.equal(transformedAfter.transformed, true);
  assert.deepEqual(transformedAfter.storedStats, copiedStats);
  assert.equal(transformedAfter.baseStoredStats.spa, session.teams.a.pokemons[0].pokemon.stats.find((stat) => stat.name === "special-attack")!.value);
  assert.equal(transformedAfter.moveSlots.find((move) => move.id === "psychic")!.pp, 4);
  assert.equal(session.teams.a.pokemons[0].moves!.find((move) => move.id === 144)!.currentPp, 4);
  assert(validTrainerBattleSession(session));
});
