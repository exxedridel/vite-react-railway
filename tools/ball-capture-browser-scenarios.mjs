import assert from "node:assert/strict";
import {
  prepareLegacyBrowserItem,
  startLegacyBrowserItem,
  waitLocalItemFlush,
} from "./legacy-item-browser-fixture.mjs";

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
  const waitFlush = () => waitLocalItemFlush({ playerA, waitArgs });
  const forceD20 = (roll) =>
    evalArgs(
      playerA,
      (roll) => {
        const original = crypto.getRandomValues.bind(crypto);
        crypto.getRandomValues = (values) => {
          if (values instanceof Uint32Array && values.length === 1) {
            values[0] = roll - 1;
            return values;
          }
          return original(values);
        };
      },
      roll,
    );
  const blockWrite = async (requestId, stage) =>
    evalArgs(
      playerA,
      (requestId, stage) => {
        const original = Storage.prototype.setItem;
        window.__restoreLegacyCaptureStorage = () => {
          Storage.prototype.setItem = original;
        };
        Storage.prototype.setItem = function (key, value) {
          if (key === "persist:root:user:2") {
            const party = JSON.parse(JSON.parse(value).party);
            const blocked =
              stage === "outcome"
                ? party.lastCaptureResult?.attemptId === requestId &&
                  !party.captureAttempt
                : party.itemUseLock?.requestId === requestId &&
                  party.itemUseLock.appliedWalletRevision !== undefined;
            if (blocked) {
              window.__legacyCaptureWriteFailed = true;
              throw new Error("QA interrupted legacy capture " + stage);
            }
          }
          return original.call(this, key, value);
        };
      },
      requestId,
      stage,
    );
  const paidLegacy = async (ballId, stage, roll) => {
    await waitFlush();
    await forceD20(roll);
    const catalog = await shopService.catalog.snapshot();
    const prepared = await prepareLegacyBrowserItem({
      playerA,
      evalArgs,
      shopService,
      itemId: ballId,
      settings: {
        captureDifficulty: catalog.captureDifficulty ?? 0,
        captureRevision: catalog.revision,
      },
    });
    const originalAttempt = (await state()).itemUseLock.prepared.captureAttempt;
    const before = await shopRepository.get(2);
    await blockWrite(prepared.payload.requestId, stage);
    await startLegacyBrowserItem({ prepared, shopService, shopGateway });
    await waitArgs(
      playerA,
      () => window.__legacyCaptureWriteFailed === true,
      "legacy capture checked write is interrupted deliberately",
    );
    if (stage === "outcome") {
      await waitArgs(
        playerA,
        async (requestId) => {
          const party = (await import("/src/store/store.ts")).store.getState()
            .party;
          return (
            !party.itemUseLock &&
            party.captureAttempt?.attemptId === requestId &&
            party.captureAttempt.autoRoll !== undefined &&
            !!document.querySelector('[data-testid="capture-recover-result"]')
          );
        },
        "paid legacy die is persisted before its outcome and can be retried",
        prepared.payload.requestId,
      );
    } else {
      await waitArgs(
        playerA,
        async (requestId) =>
          (await import("/src/store/store.ts")).store.getState().party
            .itemUseLock?.requestId === requestId,
        "original legacy item reservation survives failed inventory save",
        prepared.payload.requestId,
      );
    }
    await backendWait(
      async () =>
        (await shopRepository.get(2)).uses.some(
          (entry) => entry.requestId === prepared.payload.requestId,
        ),
      "legacy payment is durable before recovery assertions",
    );
    const paid = await shopRepository.get(2);
    assert.equal(paid.items[ballId], before.items[ballId] - 1);
    assert.equal(
      paid.uses.filter(
        (entry) => entry.requestId === prepared.payload.requestId,
      ).length,
      1,
    );
    return { prepared, originalAttempt, before, paid };
  };
  const waitOutcome = (requestId) =>
    waitArgs(
      playerA,
      async (requestId) => {
        const [{ store }, storage] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
        ]);
        const party = store.getState().party;
        return (
          storage.getActiveAccountId() === 2 &&
          !party.itemUseLock &&
          !party.captureAttempt &&
          party.lastCaptureResult?.attemptId === requestId
        );
      },
      "one automatic outcome finishes the already-paid legacy throw",
      requestId,
    );
  const replayLegacy = async (prepared, paid) => {
    const actor = [...shopService.actors.values()]
      .filter((entry) => entry.user.id === 2)
      .at(-1);
    await shopService.use(actor, prepared.payload);
    await shopGateway.publish();
    const replayed = await shopRepository.get(2);
    assert.equal(
      replayed.revision,
      paid.revision,
      "a paid legacy replay never charges again",
    );
    assert.deepEqual(replayed.items, paid.items);
    assert.equal(
      replayed.uses.filter(
        (entry) => entry.requestId === prepared.payload.requestId,
      ).length,
      1,
    );
  };
  const purchaseBalls = async () => {
    await routeDashboard(admin);
    await clickButton(admin, "Tienda");
    for (const [id, name] of [
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
        "capture stock buyer is ready",
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
            .querySelector('button[aria-label="Comprar ' + name + '"]')
            .click(),
        name,
      );
      await waitArgs(
        admin,
        () =>
          !!document.querySelector('input[aria-label="Cantidad de objetos"]'),
        "ball purchase dialog",
      );
      await field(admin, 'input[aria-label="Cantidad de objetos"]', "2");
      await clickButton(admin, "Aceptar compra", "[role=dialog]");
      await waitArgs(
        admin,
        () =>
          [...document.querySelectorAll("[role=dialog]")].some(
            (d) =>
              d.textContent.includes("El jugador guardó") &&
              [...d.querySelectorAll("button")].some(
                (b) => b.textContent.trim() === "Listo" && !b.disabled,
              ),
          ),
        "purchased balls are saved",
      );
      await clickButton(admin, "Listo", "[role=dialog]");
      await waitArgs(
        admin,
        () => !document.querySelector("[role=dialog]"),
        "purchase portal finished closing",
      );
      assert.equal((await shopRepository.get(2)).items[id], 2);
    }
  };
  const routeBackOffice = async () => {
    const origin = await evalArgs(admin, () => location.origin);
    await cdp.request("Page.navigate", { url: origin + "/back-office" }, admin);
    await waitArgs(
      admin,
      () =>
        !!document.querySelector(
          'input[aria-label="Dificultad global de captura"]',
        ),
      "capture difficulty editor mounted",
    );
  };
  const saveDifficulty = async (modifier) => {
    await field(
      admin,
      'input[aria-label="Dificultad global de captura"]',
      String(modifier),
    );
    await waitArgs(
      admin,
      () => {
        const b = document.querySelector(
          '[data-testid="capture-difficulty-save"]',
        );
        return b && !b.disabled;
      },
      "capture rules can be saved",
    );
    await evalArgs(admin, () =>
      document.querySelector('[data-testid="capture-difficulty-save"]').click(),
    );
    await waitArgs(
      admin,
      () =>
        !!document.querySelector('[data-testid="capture-difficulty-saved"]'),
      "capture rules were saved by the administrator",
    );
    await backendWait(
      async () =>
        (await shopService.catalog.snapshot()).captureDifficulty === modifier,
      "canonical capture difficulty changed",
    );
  };
  const assertMinima = async (modifier, base) =>
    waitArgs(
      playerA,
      async ({ expected, modifier }) => {
        const [{ store }, { captureRequirements }] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/lib/captureRates.ts"),
        ]);
        const party = store.getState().party;
        if (party.captureSettings?.captureDifficulty !== modifier) return false;
        const quote = captureRequirements(
          party.opponent.pokemon,
          party.opponent.statuses,
          modifier,
        );
        return ["poke-ball", "great-ball", "ultra-ball"].every((id, index) => {
          const button = document.querySelector(
            '[data-testid="capture-ball-' + id + '"]',
          );
          return (
            button &&
            quote.balls[index].minimum === expected[index] &&
            !/D20|mínimo/i.test(button.textContent) &&
            button.disabled === expected[index] > 20
          );
        });
      },
      "capture rules and availability update without exposing dice instructions before throwing",
      { expected: base.map((n) => n + modifier), modifier },
    );

  // Real purchases remain the source of inventory for old and new item flows.
  await routeDashboard(playerA);
  await waitFlush();
  await seedPvpTeam(playerA, 1, 45, 1.3);
  const initial = await state(),
    prices = (await shopService.catalog.snapshot()).prices;
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
  await fixtureEncounter("legacy-capture-cancel");
  await openThrow();
  const cancelParty = await state(),
    cancelWallet = await shopRepository.get(2);
  await clickButton(playerA, "Cancelar", "[role=dialog]");
  assert.deepEqual((await state()).bag, cancelParty.bag);
  assert.deepEqual((await shopRepository.get(2)).items, cancelWallet.items);

  // Existing paid v1 plans retain their original hash/seed/ID. Only after their
  // original receipt is APPLIED does the new UI persist the automatic D20.
  await fixtureEncounter("legacy-capture-paid-success", false, true);
  const beforeCapture = await state();
  const success = await paidLegacy("great-ball", "outcome", 20);
  const frozen = (await state()).captureAttempt;
  assert.equal(frozen.autoRoll, 20);
  for (const key of [
    "attemptId",
    "minimum",
    "seed",
    "resultCaptureId",
    "expectedCombatHash",
  ])
    assert.deepEqual(frozen[key], success.originalAttempt[key]);
  await evalArgs(playerA, async () => {
    const [{ store }, actions] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/slices/partySlice.ts"),
    ]);
    const count = store.getState().party.pokemons.length;
    store.dispatch(
      actions.captureWildOpponent(store.getState().party.opponent.encounterId),
    );
    if (store.getState().party.pokemons.length !== count)
      throw new Error("Raw free capture bypassed its guard");
  });
  await routeBackOffice();
  await saveDifficulty(2);
  assert.equal((await state()).captureAttempt.minimum, frozen.minimum);
  assert.deepEqual((await state()).captureAttempt.seed, frozen.seed);
  await cdp.request("Page.reload", {}, playerA);
  await waitOutcome(success.prepared.payload.requestId);
  let completed = await state();
  assert.equal(completed.lastCaptureResult.roll, 20);
  assert.equal(completed.lastCaptureResult.minimum, frozen.minimum);
  assert.equal(
    completed.pokemons.filter(
      (entry) => entry.captureId === frozen.resultCaptureId,
    ).length,
    1,
  );
  const capture = completed.pokemons.find(
    (entry) => entry.captureId === frozen.resultCaptureId,
  );
  assert.deepEqual(capture.pokemon.stats, beforeCapture.opponent.pokemon.stats);
  assert.deepEqual(capture.statuses, ["poisoned"]);
  assert.equal(
    capture.moves[0].currentPp,
    beforeCapture.opponent.moves[0].currentPp,
  );
  await replayLegacy(success.prepared, success.paid);
  await cdp.request("Page.reload", {}, playerA);
  await waitOutcome(success.prepared.payload.requestId);
  assert.equal(
    (await state()).pokemons.filter(
      (entry) => entry.captureId === frozen.resultCaptureId,
    ).length,
    1,
  );
  await saveDifficulty(0);
  console.log(
    "PASS: all three balls buy normally; cancel spends nothing; an already-paid legacy plan automatically rolls once, keeps its old minimum/seed/ID through rule changes and reload, and captures with original HP/status/PP without another debit.",
  );

  await fixtureEncounter("legacy-capture-paid-miss", true);
  const beforeMiss = await state();
  const miss = await paidLegacy("poke-ball", "outcome", 1);
  const missedAttempt = (await state()).captureAttempt;
  assert.equal(missedAttempt.autoRoll, 1);
  const expected = await evalArgs(playerA, async () => {
    const [{ store }, turn] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/lib/captureTurn.ts"),
    ]);
    const party = JSON.parse(JSON.stringify(store.getState().party));
    const attempt = party.captureAttempt;
    party.captureAttempt = undefined;
    const next = turn.runFailedCaptureTurn(
      party,
      attempt.captureId,
      attempt.seed,
      "ball-miss:" + attempt.attemptId,
    );
    return {
      pokemons: next.pokemons,
      opponent: next.opponent,
      battleField: next.battleField,
      emerald: next.emerald,
    };
  });
  assert.deepEqual(
    (await state()).pokemons,
    beforeMiss.pokemons,
    "failed result write cannot partially apply the rival attack",
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitOutcome(miss.prepared.payload.requestId);
  completed = await state();
  for (const key of ["pokemons", "opponent", "battleField", "emerald"])
    assert.deepEqual(
      completed[key],
      expected[key],
      "retry preserves native seed and a single wild response: " + key,
    );
  assert.equal(completed.lastCaptureResult.roll, 1);
  assert.equal(completed.lastCaptureResult.outcome, "escaped");
  assert.equal(
    completed.pokemons[0].moves[0].currentPp,
    beforeMiss.pokemons[0].moves[0].currentPp,
  );
  await replayLegacy(miss.prepared, miss.paid);
  console.log(
    "PASS: a paid legacy miss persists its D20 before effects; failed outcome storage and reload reuse the native seed for one response/turn without charging or spending own PP again.",
  );

  await fixtureEncounter("legacy-capture-wallet-recovery");
  const interrupted = await paidLegacy("ultra-ball", "wallet", 20);
  assert(
    (await state()).itemUseLock,
    "post-debit storage failure retains the original legacy reservation",
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitOutcome(interrupted.prepared.payload.requestId);
  completed = await state();
  assert.ok(
    completed.lastCaptureResult.roll >= 1 &&
      completed.lastCaptureResult.roll <= 20,
  );
  await replayLegacy(interrupted.prepared, interrupted.paid);
  console.log(
    "PASS: interrupted legacy inventory/effect save recovers its paid receipt and finishes automatically after reload, without a new item payment.",
  );

  await waitFlush();
  await fixtureWallet({
    items: {
      ...(await state()).bag.items,
      "poke-ball": 3,
      "great-ball": 3,
      "ultra-ball": 3,
    },
  });
  await fixtureEncounter("capture-global-rules");
  const base = await evalArgs(playerA, async () => {
    const [{ store }, rates] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/lib/captureRates.ts"),
    ]);
    const party = store.getState().party;
    return rates
      .captureRequirements(party.opponent.pokemon, party.opponent.statuses, 0)
      .balls.filter((entry) => entry.id !== "master")
      .map((entry) => entry.minimum);
  });
  await openThrow();
  await assertMinima(0, base);
  await saveDifficulty(2);
  await assertMinima(2, base);
  for (const invalid of [-1, 1.5, 21]) {
    await field(
      admin,
      'input[aria-label="Dificultad global de captura"]',
      String(invalid),
    );
    assert.equal(
      await evalArgs(
        admin,
        () =>
          document.querySelector('[data-testid="capture-difficulty-save"]')
            .disabled,
      ),
      true,
    );
    assert.equal((await shopService.catalog.snapshot()).captureDifficulty, 2);
  }
  await cdp.request("Page.reload", {}, admin);
  await waitArgs(
    admin,
    () =>
      document.querySelector('input[aria-label="Dificultad global de captura"]')
        ?.value === "2",
    "capture difficulty persists after administrator reload",
  );
  await routeDashboard(playerA);
  await openThrow();
  await assertMinima(2, base);
  await saveDifficulty(20);
  await assertMinima(20, base);
  const impossible = await shopRepository.get(2),
    localImpossible = await state();
  for (const id of balls)
    assert.equal(
      await evalArgs(
        playerA,
        (id) =>
          document.querySelector('[data-testid="capture-ball-' + id + '"]')
            .disabled,
        id,
      ),
      true,
    );
  assert.equal(
    await evalArgs(
      playerA,
      () => !!document.querySelector('[data-testid="capture-throw-confirm"]'),
    ),
    false,
    "new capture UI has no separate confirmation or manual outcome controls",
  );
  assert.deepEqual((await state()).bag.items, localImpossible.bag.items);
  assert.deepEqual((await shopRepository.get(2)).items, impossible.items);
  await saveDifficulty(0);
  await assertMinima(0, base);
  await clickButton(playerA, "Cancelar", "[role=dialog]");
  await fixtureWallet({
    items: {
      ...(await state()).bag.items,
      "poke-ball": 0,
      "great-ball": 0,
      "ultra-ball": 0,
    },
  });
  await openManagement();
  assert.equal(
    await evalArgs(
      playerA,
      () => document.querySelector('[data-testid="capture-open"]').disabled,
    ),
    true,
  );
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
  console.log(
    "PASS: global capture difficulty updates all ball minima, persists through reload, rejects invalid inputs, blocks impossible rolls before any charge and disables capture with no balls.",
  );
}
