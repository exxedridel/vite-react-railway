import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Real player/admin UI and checked local storage, against isolated local Nest. */
export async function runBallCaptureBrowserScenario({
  admin,
  playerA,
  cdp,
  evalArgs,
  waitArgs,
  field,
  clickButton,
  seedPvpTeam,
  shopRepository,
  shopGateway,
  shopService,
}) {
  const balls = ["poke-ball", "great-ball", "ultra-ball"];
  const state = () =>
    evalArgs(playerA, async () =>
      JSON.parse(
        JSON.stringify(
          (await import("/src/store/store.ts")).store.getState().party,
        ),
      ),
    );
  const backendWait = async (condition, label) => {
    const deadline = Date.now() + 20000;
    while (!(await condition())) {
      if (Date.now() > deadline) throw new Error(`Timeout: ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };
  const routeDashboard = async (page) => {
    const origin = await evalArgs(page, () => location.origin);
    await cdp.request("Page.stopLoading", {}, page);
    await cdp.request("Page.navigate", { url: origin + "/dashboard" }, page);
    await waitArgs(
      page,
      async () =>
        location.pathname === "/dashboard" &&
        !!document.querySelector('a[href="/mensajes-prueba"]') &&
        (await import("/src/store/accountStorage.ts")).getActiveAccountId() !==
          null,
      "capture dashboard and saved account ready",
    );
  };
  const fixtureWallet = async (update) => {
    const row = await shopRepository.get(2),
      previous = row.storageRevision;
    Object.assign(row, update);
    row.revision++;
    row.storageRevision++;
    assert.equal(await shopRepository.compareAndSwap(row, previous), true);
    await shopGateway.publish();
    await waitArgs(
      playerA,
      async (revision) =>
        (await import("/src/store/store.ts")).store.getState().party.bag
          .walletRevision === revision,
      "canonical capture inventory synchronized",
      row.revision,
    );
  };
  const fixtureEncounter = async (name, damaging = false, poisoned = false) =>
    evalArgs(
      playerA,
      async (name, damaging, poisoned) => {
        const [{ transactPvpParty }, storage, field] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
          import("/src/lib/battleField.ts"),
        ]);
        await transactPvpParty(2, async (current) => {
          if (
            current.captureAttempt ||
            current.itemUseLock ||
            current.centerLock ||
            current.shopLock ||
            current.resetLock ||
            current.pvpLock
          )
            throw new Error(
              "A capture fixture must never discard a pending operation",
            );
          const party = JSON.parse(JSON.stringify(current));
          const own = party.pokemons[0];
          own.pokemon.stats.find((s) => s.name === "hp").value = 45;
          own.statuses = [];
          own.statusTurns = {};
          own.moves[0].currentPp = 17;
          const move = damaging
            ? {
                id: 33,
                name: "tackle",
                displayName: "Tackle",
                type: "normal",
                damageClass: "physical",
                power: 35,
                accuracy: 95,
                pp: 35,
                currentPp: 12,
                priority: 0,
                description: "Capture QA",
                source: "wild",
              }
            : { ...own.moves[0], currentPp: 12, source: "wild" };
          const pokemon = JSON.parse(JSON.stringify(own.pokemon));
          pokemon.stats.find((s) => s.name === "hp").value = 22;
          party.opponent = {
            kind: "wild",
            encounterId: name,
            pokemon,
            moves: [move],
            statuses: poisoned ? ["poisoned", "confused"] : [],
            statusTurns: poisoned ? { confused: 3 } : {},
            stages: {},
          };
          party.battleField = field.emptyBattleField();
          party.emerald = undefined;
          party.lastEmeraldBatch = undefined;
          party.lastMovesByPlayer = {};
          party.lastOpponentMove = null;
          party.starterClaimed = true;
          party.pvpRevision = storage.pvpPartyRevision(current) + 1;
          return { party, value: undefined };
        });
      },
      name,
      damaging,
      poisoned,
    );
  const openManagement = async () => {
    await routeDashboard(playerA);
    await waitArgs(
      playerA,
      () =>
        !!document.querySelector(
          'button[aria-label="Abrir combate de clefairy"]',
        ),
      "open wild battle action available",
    );
    await evalArgs(playerA, () =>
      document
        .querySelector('button[aria-label="Abrir combate de clefairy"]')
        .click(),
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector(".battle-scene"),
      "wild arena mounted",
    );
    await clickButton(playerA, "Oponente", "[role=dialog]");
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="capture-open"]'),
      "wild encounter capture panel mounted",
    );
  };
  const openThrow = async () => {
    await openManagement();
    await waitArgs(
      playerA,
      () => {
        const b = document.querySelector('[data-testid="capture-open"]');
        return b && !b.disabled;
      },
      "stock-backed capture launch enabled",
    );
    await evalArgs(playerA, () =>
      document.querySelector('[data-testid="capture-open"]').click(),
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="capture-ball-poke-ball"]'),
      "ball inventory chooser opened",
    );
    assert.equal(
      await evalArgs(playerA, () =>
        [...document.querySelectorAll("button")].some(
          (b) => b.textContent.trim() === "Captura conseguida",
        ),
      ),
      false,
      "free capture confirmation is gone",
    );
    assert.equal(
      await evalArgs(
        playerA,
        () => !!document.querySelector('[data-testid="capture-result-caught"]'),
      ),
      false,
      "success cannot be registered before spending a ball",
    );
  };
  const chooseBall = async (ballId) => {
    await evalArgs(
      playerA,
      (id) => {
        const b = document.querySelector(`[data-testid="capture-ball-${id}"]`);
        if (!b || b.disabled)
          throw new Error("Selected ball has no available stock");
        b.click();
      },
      ballId,
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="capture-ball-quote"]'),
      "selected ball and physical D20 minimum quoted before debit",
    );
    const quote = await evalArgs(
      playerA,
      async (id) => {
        const [{ store }, rates] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/lib/captureRates.ts"),
        ]);
        const p = store.getState().party;
        const code = {
          "poke-ball": "poke",
          "great-ball": "great",
          "ultra-ball": "ultra",
        }[id];
        return {
          minimum: rates
            .captureRequirements(p.opponent.pokemon, p.opponent.statuses)
            .balls.find((b) => b.id === code).minimum,
          text: document.querySelector('[data-testid="capture-ball-quote"]')
            .textContent,
        };
      },
      ballId,
    );
    assert.ok(quote.text.includes(`${quote.minimum} o más`));
    return quote.minimum;
  };
  const confirmThrow = async () => {
    await waitArgs(
      playerA,
      () => {
        const b = document.querySelector(
          '[data-testid="capture-throw-confirm"]',
        );
        return b && !b.disabled;
      },
      "throw ready to consume inventory",
    );
    await evalArgs(playerA, () => {
      const b = document.querySelector('[data-testid="capture-throw-confirm"]');
      b.click();
      b.click();
    });
  };
  const waitPaidRoll = async (ballId) => {
    await waitArgs(
      playerA,
      async (id) => {
        const p = (await import("/src/store/store.ts")).store.getState().party;
        return (
          !p.itemUseLock &&
          p.captureAttempt?.ballId === id &&
          !!document.querySelector('[data-testid="capture-roll-pending"]')
        );
      },
      "paid throw awaiting physical die result",
      ballId,
    );
    return (await state()).captureAttempt;
  };
  const outcome = async (result) => {
    await evalArgs(
      playerA,
      (result) => {
        const b = document.querySelector(
          `[data-testid="capture-result-${result}"]`,
        );
        if (!b || b.disabled)
          throw new Error("Physical capture result is not ready");
        b.click();
        b.click();
      },
      result,
    );
  };
  const waitOutcome = async (attempt, result) => {
    await waitArgs(
      playerA,
      async (attemptId, result) => {
        const p = (await import("/src/store/store.ts")).store.getState().party;
        return (
          !p.captureAttempt &&
          !p.itemUseLock &&
          p.lastCaptureResult?.attemptId === attemptId &&
          p.lastCaptureResult.outcome === result &&
          !document.querySelector('[data-testid="capture-roll-pending"]')
        );
      },
      `capture outcome ${result} persisted once`,
      attempt.attemptId,
      result,
    );
  };
  const purchaseBalls = async () => {
    await routeDashboard(admin);
    await clickButton(admin, "Tienda");
    for (const [itemId, itemName] of [
      ["poke-ball", "Poké Ball"],
      ["great-ball", "Great Ball"],
      ["ultra-ball", "Ultra Ball"],
    ]) {
      await waitArgs(
        admin,
        () => {
          const b = document.querySelector(
            '[data-testid="shop-player-2"] button[aria-pressed]',
          );
          return b && !b.disabled;
        },
        "player available to buy capture stock",
      );
      await evalArgs(admin, () =>
        document
          .querySelector('[data-testid="shop-player-2"] button[aria-pressed]')
          .click(),
      );
      await evalArgs(
        admin,
        (name) =>
          document
            .querySelector(`button[aria-label="Comprar ${name}"]`)
            .click(),
        itemName,
      );
      await waitArgs(
        admin,
        () =>
          !!document.querySelector('input[aria-label="Cantidad de objetos"]'),
        "ball purchase amount dialog",
      );
      await field(admin, 'input[aria-label="Cantidad de objetos"]', "2");
      await clickButton(admin, "Aceptar compra", "[role=dialog]");
      await waitArgs(
        admin,
        () =>
          document
            .querySelector("[role=dialog]")
            ?.textContent.includes("El jugador guardó"),
        "purchased capture balls delivered",
      );
      await waitArgs(
        admin,
        () =>
          [...document.querySelectorAll("[role=dialog] button")].some(
            (b) => b.textContent.trim() === "Listo" && !b.disabled,
          ),
        "ball purchase completion is ready to close",
      );
      await clickButton(admin, "Listo", "[role=dialog]");
      await waitArgs(
        admin,
        () => !document.querySelector("[role=dialog]"),
        "ball purchase dialog closes before next purchase",
      );
      assert.equal((await shopRepository.get(2)).items[itemId], 2);
    }
  };

  await routeDashboard(playerA);
  await seedPvpTeam(playerA, 1, 45, 1.3);
  const initial = await state();
  const prices = (await shopService.catalog.snapshot()).prices;
  await fixtureWallet({
    balance: 5000 + 2 * balls.reduce((sum, id) => sum + prices[id], 0),
    items: {
      ...initial.bag.items,
      "poke-ball": 0,
      "great-ball": 0,
      "ultra-ball": 0,
    },
  });
  await purchaseBalls();
  await fixtureEncounter("ball-browser-first");
  await openThrow();
  const beforeCancel = await state(),
    serverBeforeCancel = await shopRepository.get(2);
  await chooseBall("poke-ball");
  await evalArgs(playerA, () => {
    const dialog = document
      .querySelector('[data-testid="capture-ball-quote"]')
      .closest("[role=dialog]");
    [...dialog.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Cancelar")
      .click();
  });
  assert.deepEqual((await state()).bag, beforeCancel.bag);
  assert.equal(
    (await shopRepository.get(2)).uses?.length ?? 0,
    serverBeforeCancel.uses?.length ?? 0,
  );

  await openThrow();
  const minimum = await chooseBall("poke-ball"),
    beforeMiss = await state();
  const usesBefore = (await shopRepository.get(2)).uses?.length ?? 0;
  await confirmThrow();
  const first = await waitPaidRoll("poke-ball");
  // Allow the consumed ball chooser/encounter-manager closing animation to finish.
  await new Promise((resolve) => setTimeout(resolve, 350));
  for (const [label, width, height] of [
    ["desktop", 1280, 960],
    ["narrow", 375, 844],
  ]) {
    await cdp.request(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      playerA,
    );
    await cdp.request("Page.getLayoutMetrics", {}, playerA);
    const shot = await cdp.request(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      playerA,
    );
    const path = join(tmpdir(), `pokemon-capture-${label}.png`);
    await writeFile(path, Buffer.from(shot.data, "base64"));
    console.log(`Capture visual QA ${label}: ${path}`);
    assert.ok(
      await evalArgs(
        playerA,
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${label} capture roll has no horizontal overflow`,
    );
  }
  await cdp.request(
    "Emulation.setDeviceMetricsOverride",
    { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false },
    playerA,
  );
  if (process.argv.includes("--capture-visual-only")) return;
  const paid = await state();
  assert.equal(first.minimum, minimum);
  assert.equal(
    paid.bag.items["poke-ball"],
    beforeMiss.bag.items["poke-ball"] - 1,
  );
  assert.equal((await shopRepository.get(2)).uses.length, usesBefore + 1);
  assert.deepEqual(
    paid.pokemons,
    beforeMiss.pokemons,
    "no capture or attack occurs before the external result",
  );
  assert.deepEqual(paid.opponent, beforeMiss.opponent);
  await evalArgs(playerA, async () => {
    const [{ store }, actions] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/slices/partySlice.ts"),
    ]);
    const before = JSON.stringify(store.getState().party.pokemons);
    store.dispatch(
      actions.captureWildOpponent(store.getState().party.opponent.encounterId),
    );
    store.dispatch(
      actions.changePokemonHp({
        captureId: store.getState().party.pokemons[0].captureId,
        amount: -1,
      }),
    );
    if (JSON.stringify(store.getState().party.pokemons) !== before)
      throw new Error(
        "Unpaid direct capture or a party action bypassed the pending roll",
      );
  });
  await outcome("escaped");
  await waitOutcome(first, "escaped");
  const missed = await state();
  assert.equal(missed.pokemons.length, beforeMiss.pokemons.length);
  assert.equal(
    missed.pokemons[0].moves[0].currentPp,
    beforeMiss.pokemons[0].moves[0].currentPp,
  );
  assert.equal(
    missed.opponent.moves[0].currentPp,
    beforeMiss.opponent.moves[0].currentPp - 1,
  );
  assert.equal(
    missed.battleField.turn,
    (beforeMiss.battleField?.turn ?? 1) + 1,
  );
  assert.deepEqual(
    missed.bag,
    paid.bag,
    "external failure spends no second ball or money",
  );
  console.log(
    "PASS: real Poké/Great/Ultra purchases, quote/cancel before debit, no free-capture bypass, one paid ball before physical outcome, miss consumes turn and wild PP but no player move PP.",
  );

  await openThrow();
  await chooseBall("great-ball");
  const beforeCaught = await state();
  await confirmThrow();
  const savedAttempt = await waitPaidRoll("great-ball");
  const capturedWallet = await shopRepository.get(2);
  await cdp.request("Page.reload", {}, playerA);
  const recoveredAttempt = await waitPaidRoll("great-ball");
  assert.deepEqual(
    recoveredAttempt,
    savedAttempt,
    "reload preserves original paid ball, minimum, seed and target",
  );
  await outcome("caught");
  await waitOutcome(savedAttempt, "caught");
  const caught = await state();
  assert.equal(caught.pokemons.length, beforeCaught.pokemons.length + 1);
  assert.equal(
    caught.pokemons.filter((p) => p.captureId === savedAttempt.resultCaptureId)
      .length,
    1,
  );
  const capture = caught.pokemons.find(
    (p) => p.captureId === savedAttempt.resultCaptureId,
  );
  assert.deepEqual(capture.pokemon.stats, beforeCaught.opponent.pokemon.stats);
  assert.deepEqual(
    capture.moves.map((m) => [m.id, m.currentPp]),
    beforeCaught.opponent.moves.map((m) => [m.id, m.currentPp]),
  );
  assert.equal(caught.opponent, null);
  assert.deepEqual((await shopRepository.get(2)).items, capturedWallet.items);
  assert.equal((await shopRepository.get(2)).revision, capturedWallet.revision);
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async (count) => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return p.pokemons.length === count && !p.captureAttempt;
    },
    "successful capture stays singular after reload",
    caught.pokemons.length,
  );
  console.log(
    "PASS: a paid Great Ball external roll survives reload; captured current HP/PP are kept and neither double-click nor another reload duplicates capture or payment.",
  );

  await fixtureEncounter("ball-storage-debit", false, true);
  await openThrow();
  await chooseBall("ultra-ball");
  const beforeFailedDebit = await state();
  await evalArgs(playerA, () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "persist:root:user:2") {
        const p = JSON.parse(JSON.parse(value).party);
        if (
          p.captureAttempt &&
          p.itemUseLock?.appliedWalletRevision !== undefined
        )
          throw new Error("QA interrupted checked save of paid ball");
      }
      return original.call(this, key, value);
    };
  });
  await confirmThrow();
  await waitArgs(
    playerA,
    () => !!document.querySelector('[data-testid="item-use-lock"]'),
    "paid ball inventory save failure remains recoverably locked",
  );
  const interruptedRequestId = (await state()).itemUseLock.requestId;
  await backendWait(
    async () =>
      (await shopRepository.get(2)).uses?.some(
        (use) =>
          use.requestId === interruptedRequestId &&
          use.itemId === "ultra-ball" &&
          use.status === "pending",
      ),
    "interrupted Ultra Ball receipt is durably committed before checking stock",
  );
  const failedRow = await shopRepository.get(2);
  assert.equal(
    failedRow.items["ultra-ball"],
    beforeFailedDebit.bag.items["ultra-ball"] - 1,
  );
  assert.equal(failedRow.uses.at(-1).status, "pending");
  await cdp.request("Page.reload", {}, playerA);
  const debitRecovered = await waitPaidRoll("ultra-ball");
  assert.equal(
    (await shopRepository.get(2)).uses.length,
    failedRow.uses.length,
  );
  assert.equal((await shopRepository.get(2)).revision, failedRow.revision);
  await outcome("caught");
  await waitOutcome(debitRecovered, "caught");
  const poisonCapture = (await state()).pokemons.find(
    (p) => p.captureId === debitRecovered.resultCaptureId,
  );
  assert.deepEqual(
    poisonCapture.statuses,
    ["poisoned"],
    "capture retains primary status and clears secondary combat effects",
  );
  assert.equal(
    poisonCapture.pokemon.stats.find((s) => s.name === "hp").value,
    22,
  );
  console.log(
    "PASS: interrupted post-debit inventory save recovers one original Ultra Ball receipt after reload and captures without healing HP/primary status.",
  );

  await fixtureEncounter("ball-storage-outcome", true);
  await openThrow();
  await chooseBall("poke-ball");
  await confirmThrow();
  const retryAttempt = await waitPaidRoll("poke-ball");
  const beforeFailedResult = await state(),
    resultRow = await shopRepository.get(2);
  const expected = await evalArgs(playerA, async () => {
    const [{ store }, turn] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/lib/captureTurn.ts"),
    ]);
    const p = JSON.parse(JSON.stringify(store.getState().party)),
      a = p.captureAttempt;
    p.captureAttempt = undefined;
    const result = turn.runFailedCaptureTurn(
      p,
      a.captureId,
      a.seed,
      `ball-miss:${a.attemptId}`,
    );
    return JSON.parse(
      JSON.stringify({
        pokemons: result.pokemons,
        opponent: result.opponent,
        battleField: result.battleField,
        emerald: result.emerald,
      }),
    );
  });
  await evalArgs(
    playerA,
    (attemptId) => {
      const original = Storage.prototype.setItem;
      window.__restoreCaptureStorage = () => {
        Storage.prototype.setItem = original;
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === "persist:root:user:2") {
          const p = JSON.parse(JSON.parse(value).party);
          if (p.lastCaptureResult?.attemptId === attemptId && !p.captureAttempt)
            throw new Error("QA interrupted physical die outcome save");
        }
        return original.call(this, key, value);
      };
    },
    retryAttempt.attemptId,
  );
  await outcome("escaped");
  await waitArgs(
    playerA,
    () =>
      document
        .querySelector('[data-testid="capture-roll-pending"] [role=alert]')
        ?.textContent.includes("guardar"),
    "failed outcome save offers retry on same physical throw",
  );
  assert.deepEqual(
    (await state()).captureAttempt,
    beforeFailedResult.captureAttempt,
  );
  assert.deepEqual(
    (await state()).pokemons,
    beforeFailedResult.pokemons,
    "failed checked save does not apply a partial enemy turn",
  );
  await evalArgs(playerA, () => window.__restoreCaptureStorage());
  await outcome("escaped");
  await waitOutcome(retryAttempt, "escaped");
  const retrySaved = await state();
  for (const key of ["pokemons", "opponent", "battleField", "emerald"])
    assert.deepEqual(
      retrySaved[key],
      expected[key],
      `saved outcome retry keeps deterministic ${key}`,
    );
  assert.equal((await shopRepository.get(2)).revision, resultRow.revision);
  assert.equal(
    (await shopRepository.get(2)).uses.length,
    resultRow.uses.length,
  );
  console.log(
    "PASS: failed external-outcome persistence preserves the pending throw and retries the identical seeded wild response without a second turn, capture or inventory debit.",
  );

  await fixtureWallet({
    items: {
      ...retrySaved.bag.items,
      "poke-ball": 0,
      "great-ball": 1,
      "ultra-ball": 0,
    },
  });
  await fixtureEncounter("ball-last-one");
  await openThrow();
  for (const id of ["poke-ball", "ultra-ball"])
    assert.equal(
      await evalArgs(
        playerA,
        (id) =>
          document.querySelector(`[data-testid="capture-ball-${id}"]`).disabled,
        id,
      ),
      true,
    );
  await chooseBall("great-ball");
  await confirmThrow();
  const last = await waitPaidRoll("great-ball");
  const depleted = await shopRepository.get(2);
  assert.ok(balls.every((id) => (depleted.items[id] ?? 0) === 0));
  await outcome("escaped");
  await waitOutcome(last, "escaped");
  await openManagement();
  assert.equal(
    await evalArgs(
      playerA,
      () => document.querySelector('[data-testid="capture-open"]').disabled,
    ),
    true,
    "no ball left means no further throw",
  );
  assert.ok(
    await evalArgs(playerA, () =>
      document.body.textContent.includes("No tienes pokebolas en tu Bag"),
    ),
  );
  assert.deepEqual(
    cdp.exceptions,
    [],
    "Unexpected Chrome JavaScript exception",
  );
  console.log(
    "PASS: depleted ball types stay disabled and the final failed physical throw leaves no further attempt available with an empty Bag.",
  );
}
