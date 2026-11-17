import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRAINER_REWARD_AMOUNTS,
  matchingLocalReward,
  queueLocalTrainerReward,
  validCombatReward,
  validLocalRewardClaim,
  validLocalRewardOutbox,
  type CombatReward,
  type LocalTrainerRewardClaim,
} from "../src/lib/shop/combatRewards";
import type { PartyState } from "../src/slices/partySlice";
import type { BattleOpponent } from "../src/lib/battleOpponent";

const claim: LocalTrainerRewardClaim = {
  encounterId: "reward-money-encounter",
  epoch: 3,
  color: "pink",
};
const credited = (overrides: Partial<CombatReward> = {}): CombatReward => ({
  rewardId: `local:${claim.encounterId}`,
  userId: 2,
  source: "local-trainer",
  encounterId: claim.encounterId,
  epoch: claim.epoch,
  color: claim.color,
  amount: 200,
  walletRevision: 7,
  status: "credited",
  ...overrides,
});
function opponent(overrides: Partial<BattleOpponent> = {}): BattleOpponent {
  return {
    kind: "trainer",
    encounterId: claim.encounterId,
    rewards: { version: 1, color: claim.color, epoch: claim.epoch },
    ...overrides,
  } as BattleOpponent;
}
const party = () =>
  ({ bag: { money: 500, items: { "poke-ball": 1 } } }) as PartyState;

test("local trainer monetary table matches every confirmed square, including yellow, red and unrewarded gold", () => {
  assert.deepEqual(TRAINER_REWARD_AMOUNTS, {
    pink: 200,
    green: 300,
    blue: 400,
    yellow: 500,
    red: 600,
    gold: 0,
  });
  for (const [color, amount] of Object.entries(TRAINER_REWARD_AMOUNTS)) {
    assert.equal(
      validCombatReward(
        credited({ color: color as typeof claim.color, amount }),
      ),
      true,
    );
    assert.equal(
      validCombatReward(
        credited({ color: color as typeof claim.color, amount: amount + 1 }),
      ),
      false,
    );
  }
});

test("queueing records the frozen encounter and game epoch once without changing central money or inventory", () => {
  const current = party();
  const bag = structuredClone(current.bag);
  const frozen = opponent();
  queueLocalTrainerReward(current, frozen);
  assert.deepEqual(current.localRewardOutbox, [claim]);
  queueLocalTrainerReward(current, structuredClone(frozen));
  assert.deepEqual(current.localRewardOutbox, [claim]);
  queueLocalTrainerReward(current, opponent({ encounterId: "second-victory" }));
  assert.equal(
    current.localRewardOutbox!.length,
    2,
    "a new encounter against the same trainer is an independent victory",
  );
  assert.deepEqual(current.bag, bag);
  assert.equal(frozen.rewards!.epoch, 3);
});

test("wild, old encounters without reward metadata, and golden trainer squares never queue money", () => {
  for (const foe of [
    opponent({ kind: "wild" }),
    opponent({ rewards: undefined }),
    opponent({ encounterId: undefined }),
    opponent({ rewards: { version: 1, color: "gold", epoch: 3 } }),
  ]) {
    const current = party();
    queueLocalTrainerReward(current, foe);
    assert.equal(current.localRewardOutbox, undefined);
    assert.equal(current.bag!.money, 500);
  }
});

test("only an exact authenticated terminal reward matches a queued claim", () => {
  const valid = credited();
  assert.equal(matchingLocalReward(claim, valid, 2), true);
  assert.equal(matchingLocalReward(claim, valid, 3), false);
  assert.equal(matchingLocalReward(claim, credited({ userId: 3 }), 2), false);
  assert.equal(matchingLocalReward(claim, credited({ epoch: 4 }), 2), false);
  assert.equal(
    matchingLocalReward(claim, credited({ color: "green", amount: 300 }), 2),
    false,
  );
  assert.equal(
    matchingLocalReward(
      claim,
      credited({ encounterId: "other", rewardId: "local:other" }),
      2,
    ),
    false,
  );
  assert.equal(
    matchingLocalReward(
      claim,
      credited({
        source: "admin-trainer",
        battleId: "admin-battle",
        presetId: "kanto-brock",
        rewardId: "admin:admin-battle",
      }),
      2,
    ),
    false,
  );
  assert.equal(
    matchingLocalReward(claim, credited({ amount: 10000 }), 2),
    false,
    "a made-up credited amount cannot remove a pending reward",
  );
  assert.equal(
    matchingLocalReward(
      claim,
      { ...valid, status: "pending" } as unknown as CombatReward,
      2,
    ),
    false,
  );
});

test("a zero-value stale-game rejection terminates only its original exact claim", () => {
  const rejected = credited({
    status: "rejected",
    reason: "STALE_GAME",
    amount: 0,
  });
  assert.equal(validCombatReward(rejected), true);
  assert.equal(matchingLocalReward(claim, rejected, 2), true);
  assert.equal(matchingLocalReward({ ...claim, epoch: 4 }, rejected, 2), false);
  assert.equal(validCombatReward({ ...rejected, amount: 200 }), false);
  assert.equal(validCombatReward({ ...rejected, reason: undefined }), false);
  assert.equal(
    validCombatReward({ ...rejected, reason: "NETWORK_ERROR" }),
    false,
  );
  assert.equal(validCombatReward(credited({ reason: "STALE_GAME" })), false);
});

test("persisted claims reject malformed identifiers, game epochs and duplicate encounter identities", () => {
  assert.equal(validLocalRewardClaim(claim), true);
  assert.equal(validLocalRewardOutbox([]), true);
  assert.equal(
    validLocalRewardOutbox([claim, { ...claim, encounterId: "another" }]),
    true,
  );
  assert.equal(validLocalRewardOutbox([claim, { ...claim, epoch: 4 }]), false);
  assert.equal(validLocalRewardOutbox({ claims: [claim] }), false);
  for (const bad of [
    { ...claim, encounterId: "" },
    { ...claim, encounterId: "bad/id" },
    { ...claim, encounterId: "x".repeat(129) },
    { ...claim, color: "orange" },
    { ...claim, epoch: -1 },
    { ...claim, epoch: 1.5 },
    { ...claim, epoch: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.equal(validLocalRewardClaim(bad), false);
});
