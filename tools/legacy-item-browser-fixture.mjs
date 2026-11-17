import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** A verification barrier for assertions about the canonical server wallet. It
 * never controls availability of the real player's local item actions. */
export function waitLocalItemFlush({ playerA, waitArgs }) {
  return waitArgs(playerA, async () => {
    const [{ store }, storage] = await Promise.all([
      import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
    ]);
    const party = store.getState().party;
    return storage.getActiveAccountId() === 2 && party.bag?.walletUserId === 2 &&
      !(party.localItemOutbox?.operations.length ?? 0);
  }, "local inventory outbox has a canonical background confirmation");
}

/** Build a saved pre-upgrade item intent with the real old planner. New UI must
 * never initiate shop:use; these fixtures retain its recovery/ACK coverage. */
export async function prepareLegacyBrowserItem({
  playerA, evalArgs, shopService, itemId = "full-restore", captureId,
  moveId, replaceMoveId, quote, settings, requestId = randomUUID(),
}) {
  const actor = [...shopService.actors.values()]
    .filter((entry) => entry.user.id === 2 && entry.user.role === "player")
    .at(-1);
  assert.ok(actor, "legacy item fixture requires a connected original player");
  const payload = await evalArgs(playerA, async (input) => {
    const [{ store }, storage, legacy, planner] = await Promise.all([
      import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
      import("/src/lib/shop/itemUse.ts"), import("/src/lib/fullRestorePlan.ts"),
    ]);
    if (storage.getActiveAccountId() !== input.userId)
      throw new Error("Legacy fixture cannot prepare another account's Party");
    const party = store.getState().party;
    if (party.localItemOutbox?.operations.length)
      throw new Error("Flush newer local consumption before preparing legacy recovery");
    const target = input.captureId ?? party.pokemons[0]?.captureId;
    if (!target) throw new Error("Legacy item fixture has no Pokemon target");
    const ball = ["poke-ball", "great-ball", "ultra-ball"].includes(input.itemId);
    if (input.itemId !== "tm") await planner.loadFullRestoreEngine();
    const ballPlanner = ball ? await import("/src/lib/shop/ballCapture.ts") : undefined;
    const seed = ball ? Array.from(crypto.getRandomValues(new Uint16Array(4))) : [0, 0, 0, 0];
    const resultCaptureId = ball ? crypto.randomUUID() : "";
    let tmMove;
    if (input.itemId === "tm") {
      const catalog = await import("/src/lib/trainerBattle/catalog.ts");
      tmMove = catalog.trainerMoves.find((move) => move.id === input.moveId);
      if (!tmMove) throw new Error("Legacy TM fixture has no catalog movement");
    }
    await legacy.prepareItemUse(
      input.userId, input.clientId, input.requestId, target,
      party.bag.walletRevision,
      (current, captureId) => ball
        ? ballPlanner.prepareBallCaptureParty(
            current, captureId, input.itemId,
            { userId: input.userId, clientId: input.clientId, requestId: input.requestId },
            seed, resultCaptureId, input.quote, input.settings,
          )
        : input.itemId === "tm"
          ? planner.prepareTmParty(current, captureId, tmMove, input.replaceMoveId)
          : planner.preparePartyItem(current, captureId, input.itemId, input.moveId),
      input.itemId, input.moveId, input.settings?.captureRevision,
    );
    const lock = store.getState().party.itemUseLock;
    if (lock?.requestId !== input.requestId)
      throw new Error("Legacy item intent was not durably prepared");
    return {
      requestId: lock.requestId, captureId: lock.captureId,
      itemId: lock.itemId, context: lock.context, planHash: lock.planHash,
      expectedWalletRevision: lock.expectedWalletRevision,
      ...(lock.moveId === undefined ? {} : { moveId: lock.moveId }),
      ...(lock.captureRevision === undefined
        ? {} : { expectedCaptureRevision: lock.captureRevision }),
    };
  }, {
    userId: actor.user.id, clientId: actor.clientId, requestId, itemId,
    captureId, moveId, replaceMoveId, quote, settings,
  });
  return { actor, payload };
}

/** Calling this starts a protocol fixture, never a new player's UI action. The
 * real namespace snapshot lets the current frontend recover its saved intent. */
export function startLegacyBrowserItem({ prepared, shopService, shopGateway }) {
  const operation = shopService.use(prepared.actor, prepared.payload).then(
    async (response) => {
      await shopGateway.publish();
      return response;
    },
  );
  // A held service can reject before its caller reaches an explicit await.
  void operation.catch(() => {});
  return operation;
}
