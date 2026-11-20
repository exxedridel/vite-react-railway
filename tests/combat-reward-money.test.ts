import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TRAINER_REWARD_AMOUNTS,
  TRAINER_PENALTY_AMOUNTS,
  trainerPresetPenalty,
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

test("gym reward bundles validate a single typed TM and the matching badge without upgrading old receipts", () => {
  const legacyGym: CombatReward = {
    rewardId: "admin:gym-battle",
    userId: 2,
    source: "admin-trainer",
    battleId: "gym-battle",
    presetId: "kanto-brock",
    epoch: 0,
    amount: 1200,
    walletRevision: 1,
    status: "credited",
  };
  assert.equal(
    validCombatReward(legacyGym),
    true,
    "an old credited gym result without bundle metadata keeps its original valid shape",
  );
  const modernGym: CombatReward = {
    ...legacyGym,
    rewardBundleVersion: 1,
    badgeId: "boulder",
    items: { tm: 1 },
  };
  assert.equal(validCombatReward(modernGym), true);
  for (const bad of [
    { ...modernGym, badgeId: "cascade" },
    { ...modernGym, badgeId: undefined },
    { ...modernGym, items: undefined },
    { ...modernGym, items: { tm: 0 } },
    { ...modernGym, items: { tm: 2 } },
    { ...modernGym, items: { tm: 1, "poke-ball": 1 } },
    { ...modernGym, rewardBundleVersion: 2 },
    { ...modernGym, rewardBundleVersion: undefined },
  ])
    assert.equal(validCombatReward(bad), false);
  assert.deepEqual(legacyGym, {
    rewardId: "admin:gym-battle",
    userId: 2,
    source: "admin-trainer",
    battleId: "gym-battle",
    presetId: "kanto-brock",
    epoch: 0,
    amount: 1200,
    walletRevision: 1,
    status: "credited",
  });
});

test("rejected gym bundles and non-gym receipts cannot grant a badge or a TM", () => {
  const rejectedGym = {
    rewardId: "admin:old-gym",
    userId: 2,
    source: "admin-trainer",
    battleId: "old-gym",
    presetId: "kanto-brock",
    epoch: 0,
    amount: 0,
    walletRevision: 2,
    status: "rejected",
    reason: "STALE_GAME",
    rewardBundleVersion: 1,
  };
  assert.equal(validCombatReward(rejectedGym), true);
  assert.equal(
    validCombatReward({ ...rejectedGym, badgeId: "boulder", items: { tm: 1 } }),
    false,
  );
  const elite = {
    rewardId: "admin:elite-battle",
    userId: 2,
    source: "admin-trainer",
    battleId: "elite-battle",
    presetId: "kanto-lorelei",
    epoch: 0,
    amount: 3000,
    walletRevision: 3,
    status: "credited",
    rewardBundleVersion: 1,
  };
  assert.equal(validCombatReward(elite), true);
  assert.equal(
    validCombatReward({ ...elite, badgeId: "boulder", items: { tm: 1 } }),
    false,
  );
  assert.equal(
    validCombatReward({
      ...credited(),
      rewardBundleVersion: 1,
      badgeId: "boulder",
      items: { tm: 1 },
    }),
    false,
    "a local colored trainer reward cannot claim a gym bundle",
  );
});

const debited = (overrides: Partial<CombatReward> = {}): CombatReward => ({
  ...credited({ color: "red", amount: 400, status: "debited" }),
  penaltyVersion: 1,
  nominalAmount: 400,
  balanceBefore: 500,
  balanceAfter: 100,
  ...overrides,
});

test("loss tariff uses confirmed colors and every Kanto preset, including Giovanni and rival variants", () => {
  assert.deepEqual(TRAINER_PENALTY_AMOUNTS, {
    pink: 0,
    green: 100,
    blue: 200,
    yellow: 300,
    red: 400,
    gold: 0,
  });
  for (const [color, amount] of Object.entries(TRAINER_PENALTY_AMOUNTS)) {
    assert.equal(
      validCombatReward(
        debited({
          color: color as typeof claim.color,
          amount,
          nominalAmount: amount,
          balanceBefore: 500,
          balanceAfter: 500 - amount,
        }),
      ),
      true,
    );
  }
  const expected = {
    "kanto-brock": 50,
    "kanto-misty": 100,
    "kanto-surge": 200,
    "kanto-erika": 300,
    "kanto-koga": 400,
    "kanto-sabrina": 400,
    "kanto-blaine": 500,
    "kanto-giovanni": 500,
    "kanto-lorelei": 500,
    "kanto-bruno": 500,
    "kanto-agatha": 500,
    "kanto-lance": 500,
    "kanto-rival-lab-grass": 50,
    "kanto-rival-lab-fire": 50,
    "kanto-rival-lab-water": 50,
    "kanto-rival-champion-grass": 500,
    "kanto-rival-champion-fire": 500,
    "kanto-rival-champion-water": 500,
  };
  for (const [presetId, nominalAmount] of Object.entries(expected)) {
    assert.equal(trainerPresetPenalty(presetId), nominalAmount);
    assert.equal(
      validCombatReward(
        debited({
          source: "admin-trainer",
          rewardId: "admin:loss-battle",
          battleId: "loss-battle",
          presetId,
          color: undefined,
          encounterId: undefined,
          nominalAmount,
          amount: nominalAmount,
          balanceBefore: 500,
          balanceAfter: 500 - nominalAmount,
        }),
      ),
      true,
    );
  }
  assert.equal(trainerPresetPenalty("kanto-rival-lab-electric"), undefined);
  assert.equal(trainerPresetPenalty("unknown"), undefined);
});

test("defeat and forfeit queue one durable loss without editing money, items, or granting victory extras", () => {
  for (const outcome of ["lose", "forfeit"] as const) {
    const current = party();
    const before = structuredClone(current.bag);
    const foe = opponent({
      rewards: {
        version: 1,
        color: "red",
        epoch: 3,
        lossPenaltyVersion: 1,
      },
    });
    queueLocalTrainerReward(current, foe, outcome);
    const lossClaim = { ...claim, color: "red", penaltyVersion: 1 };
    assert.deepEqual(current.localRewardOutbox, [lossClaim]);
    queueLocalTrainerReward(current, structuredClone(foe), outcome);
    queueLocalTrainerReward(current, foe, "win");
    assert.deepEqual(
      current.localRewardOutbox,
      [lossClaim],
      "one encounter cannot enqueue both a loss and a win",
    );
    assert.deepEqual(current.bag, before);
    assert.equal(validLocalRewardOutbox(current.localRewardOutbox), true);
  }
});

test("zero-cost losses still get a terminal claim, but old, wild, draw, and escape encounters stay exempt", () => {
  const pink = opponent({
    rewards: {
      version: 1,
      color: "pink",
      epoch: 3,
      lossPenaltyVersion: 1,
    },
  });
  const zero = party();
  queueLocalTrainerReward(zero, pink, "lose");
  assert.deepEqual(zero.localRewardOutbox, [{ ...claim, penaltyVersion: 1 }]);
  for (const [foe, outcome] of [
    [opponent(), "lose"],
    [opponent({ rewards: undefined }), "lose"],
    [opponent({ ...pink, kind: "wild" }), "lose"],
    [pink, "draw"],
    [pink, "escape"],
  ] as const) {
    const current = party();
    queueLocalTrainerReward(current, foe, outcome);
    assert.equal(current.localRewardOutbox, undefined);
  }
});

test("loss receipts validate actual clamped debit and reject wrong tariffs, malformed money, or gym gifts", () => {
  assert.equal(validCombatReward(debited()), true);
  assert.equal(
    validCombatReward(
      debited({ amount: 37, balanceBefore: 37, balanceAfter: 0 }),
    ),
    true,
  );
  assert.equal(
    validCombatReward(
      debited({ amount: 0, balanceBefore: 0, balanceAfter: 0 }),
    ),
    true,
  );
  assert.equal(
    validCombatReward(
      debited({ balanceBefore: undefined, balanceAfter: undefined }),
    ),
    true,
    "optional audit balances do not change the receipt identity",
  );
  const stale = debited({
    status: "rejected",
    reason: "STALE_GAME",
    amount: 0,
    balanceBefore: 100,
    balanceAfter: 100,
  });
  assert.equal(validCombatReward(stale), true);
  for (const bad of [
    { penaltyVersion: 2 },
    { penaltyVersion: undefined },
    { nominalAmount: undefined },
    { nominalAmount: 401 },
    { amount: 401 },
    { amount: -1 },
    { amount: 1.5 },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
    { status: "credited" },
    { balanceAfter: -1 },
    { balanceAfter: 99 },
    { balanceBefore: undefined },
    { rewardBundleVersion: 1 },
    { badgeId: "boulder" },
    { items: { tm: 1 } },
    { reason: "STALE_GAME" },
  ])
    assert.equal(validCombatReward({ ...debited(), ...bad }), false);
  assert.equal(validCombatReward({ ...stale, amount: 1 }), false);
  assert.equal(validCombatReward({ ...stale, reason: undefined }), false);
  assert.equal(validCombatReward({ ...credited(), nominalAmount: 200 }), false);
  assert.equal(
    validCombatReward({ ...credited(), balanceBefore: 500, balanceAfter: 700 }),
    false,
  );
});

test("the first central outcome terminates a conflicting same-encounter claim without crossing accounts or epochs", () => {
  const lossClaim: LocalTrainerRewardClaim = {
    ...claim,
    color: "red",
    penaltyVersion: 1,
  };
  const winClaim: LocalTrainerRewardClaim = { ...claim, color: "red" };
  const lossReceipt = debited();
  const winReceipt = credited({ color: "red", amount: 600 });
  assert.equal(matchingLocalReward(lossClaim, lossReceipt, 2), true);
  assert.equal(matchingLocalReward(lossClaim, winReceipt, 2), true);
  assert.equal(matchingLocalReward(winClaim, lossReceipt, 2), true);
  assert.equal(matchingLocalReward(lossClaim, lossReceipt, 3), false);
  assert.equal(
    matchingLocalReward({ ...lossClaim, epoch: 4 }, lossReceipt, 2),
    false,
  );
  assert.equal(
    matchingLocalReward({ ...lossClaim, color: "blue" }, lossReceipt, 2),
    false,
  );
  assert.equal(validLocalRewardOutbox([lossClaim, winClaim]), false);
  for (const penaltyVersion of [0, 2, "1", null])
    assert.equal(validLocalRewardClaim({ ...claim, penaltyVersion }), false);
});
