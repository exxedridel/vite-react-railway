import assert from "node:assert/strict";

/** Simulate the durable state left by a frontend that knew only purchase
 * PREPARE, then exercise recovery and the explicit cancellation through UI. */
export async function legacyAdjustmentBrowserScenario({
  admin,
  playerA,
  cdp,
  evalArgs,
  waitArgs,
  field,
  clickButton,
  shopRepository,
  shopGateway,
  shopService,
}) {
  const state = () =>
    evalArgs(playerA, async () =>
      JSON.parse(
        JSON.stringify(
          (await import("/src/store/store.ts")).store.getState().party,
        ),
      ),
    );
  const email = await evalArgs(
    admin,
    () =>
      document.querySelector('[data-testid="back-office-player-2"] p')
        .textContent,
  );
  const amountSelector = `input[aria-label="Cantidad de Pokedollars para ${email}"]`;
  async function beginGrant(value) {
    await waitArgs(
      admin,
      (selector) => {
        const input = document.querySelector(selector);
        return input && !input.disabled;
      },
      "legacy recovery fixture player ready",
      amountSelector,
    );
    await field(admin, amountSelector, String(value));
    await evalArgs(
      admin,
      (label) =>
        document.querySelector(`button[aria-label="${label}"]`).click(),
      `Agregar Pokedollars a ${email}`,
    );
    await waitArgs(
      admin,
      () => {
        const button = document.querySelector(
          '[data-testid="balance-adjust-confirm"]',
        );
        return button && !button.disabled;
      },
      "grant preview ready",
    );
    await evalArgs(admin, () =>
      document.querySelector('[data-testid="balance-adjust-confirm"]').click(),
    );
    await waitArgs(
      admin,
      () =>
        document
          .querySelector('[role="dialog"]')
          ?.textContent.includes("Esperando guardado") &&
        [...document.querySelectorAll('[role="dialog"] button')].some(
          (button) => button.textContent === "Listo" && !button.disabled,
        ),
      "grant is durable and awaiting player save",
    );
    const row = await shopRepository.get(2);
    const receipt = row.adjustments.at(-1);
    assert.equal(receipt.status, "pending");
    assert.equal(receipt.delta, value);
    return { row, receipt };
  }
  async function savedBalance(expected) {
    await waitArgs(
      playerA,
      async (expected) => {
        const [{ store }, storage] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
        ]);
        const party = store.getState().party;
        return (
          party.bag?.walletUserId === 2 &&
          party.bag.money === expected &&
          !party.shopLock &&
          !storage.isLocalPartyMutationBlocked(party) &&
          !document.querySelector('[data-testid="balance-adjust-lock"]')
        );
      },
      "authoritative balance saved and game unlocked",
      expected,
    );
  }
  async function closeConfirmed(text) {
    await waitArgs(
      admin,
      (expected) =>
        document
          .querySelector('[role="dialog"]')
          ?.textContent.includes(expected) &&
        [...document.querySelectorAll('[role="dialog"] button')].some(
          (button) => button.textContent === "Listo" && !button.disabled,
        ),
      "admin observes terminal adjustment",
      text,
    );
    await clickButton(admin, "Listo", '[role="dialog"]');
  }
  function publishStalePending(receipt, row) {
    const { requestHash: _hash, createdAt: _created, ...pending } = receipt;
    for (const socket of shopGateway.namespace.sockets.values()) {
      if (socket.data.identity?.user.id !== 2) continue;
      socket.emit("shop:state", {
        wallet: {
          userId: 2,
          revision: receipt.walletRevision,
          balance: receipt.balanceAfter,
          items: row.items,
          currencyVersion: 1,
        },
        adjustments: [{ ...pending, status: "pending" }],
      });
    }
  }
  async function backendWait(predicate) {
    const until = Date.now() + 10000;
    while (!predicate()) {
      if (Date.now() > until)
        throw new Error("The player did not submit its held balance ACK");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  const beforeLegacy = await state();
  const beforeLegacyWallet = await shopRepository.get(2);
  const originalApplied = shopService.balanceApplied;
  let releaseApplied;
  let held = false;
  const gate = new Promise((resolve) => {
    releaseApplied = resolve;
  });
  shopService.balanceApplied = async function (...args) {
    held = true;
    await gate;
    return originalApplied.apply(this, args);
  };
  let legacyReceipt, legacyWallet;
  try {
    ({ receipt: legacyReceipt, row: legacyWallet } = await beginGrant(10000));
    await waitArgs(
      playerA,
      async (revision) => {
        const party = (await import("/src/store/store.ts")).store.getState()
          .party;
        return (
          party.shopLock?.appliedWalletRevision === revision &&
          party.bag.money > 10000
        );
      },
      "player saved the credit while its ACK remains pending",
      legacyReceipt.walletRevision,
    );
    await backendWait(() => held);
    await evalArgs(playerA, async () => {
      const [{ transactPvpParty }, storage] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/store/accountStorage.ts"),
      ]);
      await transactPvpParty(2, async (current) => {
        const party = JSON.parse(JSON.stringify(current));
        // This is precisely what the older frontend left on disk: the money
        // was adopted, the generic purchase lock released, and no terminal mark.
        delete party.shopLock;
        delete party.balanceAdjustmentRevision;
        party.pvpRevision = storage.pvpPartyRevision(current) + 1;
        return { party, value: undefined };
      });
    });
    const legacyState = await state();
    assert.equal(legacyState.bag.money, beforeLegacyWallet.balance + 10000);
    assert.equal(legacyState.shopLock, undefined);
    shopService.balanceApplied = originalApplied;
    await cdp.request("Page.reload", {}, playerA);
    await savedBalance(beforeLegacyWallet.balance + 10000);
    await closeConfirmed("El jugador guardó el ajuste.");
  } finally {
    shopService.balanceApplied = originalApplied;
    releaseApplied();
  }
  assert.equal(
    (await shopRepository.get(2)).adjustments.at(-1).status,
    "applied",
  );
  assert.equal(
    (await shopRepository.get(2)).balance,
    beforeLegacyWallet.balance + 10000,
  );
  assert.equal(
    (await shopRepository.get(2)).adjustments.length,
    beforeLegacyWallet.adjustments.length + 1,
  );
  assert.deepEqual((await state()).pokemons, beforeLegacy.pokemons);
  assert.deepEqual((await state()).bag.items, beforeLegacy.bag.items);
  publishStalePending(legacyReceipt, legacyWallet);
  await savedBalance(beforeLegacyWallet.balance + 10000);
  await cdp.request("Page.reload", {}, playerA);
  await savedBalance(beforeLegacyWallet.balance + 10000);
  publishStalePending(legacyReceipt, legacyWallet);
  await savedBalance(beforeLegacyWallet.balance + 10000);
  console.log(
    "PASS: an already-credited legacy 10000-PD grant without its lock recovers once; reload and stale pending packets never reopen the game lock.",
  );

  const beforeAbort = await state();
  const beforeAbortWallet = await shopRepository.get(2);
  await evalArgs(
    playerA,
    (expected) => {
      const original = Storage.prototype.setItem;
      window.__qaBalanceSetItem = original;
      Storage.prototype.setItem = function (key, value) {
        if (key === "persist:root:user:2") {
          const party = JSON.parse(JSON.parse(value).party);
          if (
            party.shopLock?.operation === "balance-adjustment" &&
            party.shopLock.appliedWalletRevision !== undefined &&
            party.bag.money === expected
          )
            throw new Error("QA persistent failure saving the 10000-PD grant");
        }
        return original.call(this, key, value);
      };
    },
    beforeAbortWallet.balance + 10000,
  );
  let aborted;
  try {
    aborted = await beginGrant(10000);
    await waitArgs(
      playerA,
      () =>
        !!document.querySelector('[data-testid="balance-adjust-lock"]') &&
        !!document.querySelector('[data-testid="balance-adjust-abort"]'),
      "stuck player has an explicit abort escape",
    );
    await waitArgs(
      admin,
      () => {
        const button = document.querySelector(
          '[role="dialog"] [data-testid="balance-adjust-abort"]',
        );
        return button && !button.disabled;
      },
      "administrator can abort the pending transaction",
    );
    await evalArgs(admin, () =>
      document
        .querySelector('[role="dialog"] [data-testid="balance-adjust-abort"]')
        .click(),
    );
    await waitArgs(
      admin,
      () => !!document.querySelector('[data-testid="balance-abort-confirm"]'),
      "abort describes the exact restored balance",
    );
    await evalArgs(admin, () =>
      document.querySelector('[data-testid="balance-abort-confirm"]').click(),
    );
    await savedBalance(beforeAbortWallet.balance);
    await closeConfirmed("Ajuste cancelado.");
  } finally {
    await evalArgs(playerA, () => {
      if (window.__qaBalanceSetItem)
        Storage.prototype.setItem = window.__qaBalanceSetItem;
      delete window.__qaBalanceSetItem;
    });
  }
  let cancelled = await shopRepository.get(2);
  assert.equal(cancelled.balance, beforeAbortWallet.balance);
  assert.equal(
    cancelled.adjustments.length,
    beforeAbortWallet.adjustments.length + 1,
  );
  assert.equal(cancelled.adjustments.at(-1).status, "cancelled");
  const administrator = [...shopService.actors.values()]
    .filter((actor) => actor.user.id === 1)
    .at(-1);
  const player = [...shopService.actors.values()]
    .filter((actor) => actor.user.id === 2)
    .at(-1);
  await shopService.balanceAbort(administrator, {
    adjustmentId: aborted.receipt.adjustmentId,
  });
  await shopService.balanceApplied(player, {
    adjustmentId: aborted.receipt.adjustmentId,
    revision: aborted.receipt.walletRevision,
  });
  cancelled = await shopRepository.get(2);
  assert.equal(
    cancelled.balance,
    beforeAbortWallet.balance,
    "duplicate abort and a late ACK cannot reverse the compensation",
  );
  assert.equal(cancelled.adjustments.at(-1).status, "cancelled");
  assert.deepEqual((await state()).pokemons, beforeAbort.pokemons);
  assert.deepEqual((await state()).bag.items, beforeAbort.bag.items);
  publishStalePending(aborted.receipt, aborted.row);
  await savedBalance(beforeAbortWallet.balance);
  await cdp.request("Page.reload", {}, playerA);
  await savedBalance(beforeAbortWallet.balance);
  assert.deepEqual((await state()).pokemons, beforeAbort.pokemons);
  console.log(
    "PASS: admin abort compensates a persistently failed grant once, releases both screens and preserves Party/items/PP through duplicate abort, late ACK and reload.",
  );
}
