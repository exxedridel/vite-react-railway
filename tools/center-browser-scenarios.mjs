import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Actual Chrome UI, local identity app and Nest relay; no production data. */
export async function runCenterBrowserScenario({
  admin,
  playerA,
  playerB,
  cdp,
  evalArgs,
  waitArgs,
  clickButton,
  seedPvpTeam,
  shopRepository,
  shopService,
  shopGateway,
}) {
  const state = (page = playerA) =>
    evalArgs(page, async () =>
      JSON.parse(
        JSON.stringify(
          (await import("/src/store/store.ts")).store.getState().party,
        ),
      ),
    );
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
      "Poké Center dashboard is mounted with its saved account",
    );
  };
  const button = (id) =>
    `[data-testid="center-player-${id}"] button[aria-pressed]`;
  const waitReady = async (id = 2) =>
    waitArgs(
      admin,
      (selector) => {
        const b = document.querySelector(selector);
        return b && !b.disabled;
      },
      `player ${id} is available at Poké Center`,
      button(id),
    );
  const choose = async (id = 2) => {
    await waitReady(id);
    await evalArgs(
      admin,
      (selector) => document.querySelector(selector).click(),
      button(id),
    );
    await waitArgs(
      admin,
      () => !!document.querySelector('[data-testid="center-team"]'),
      "current Party preview arrives over WebSocket",
    );
  };
  const selectCapture = async (captureId) => {
    await evalArgs(
      admin,
      (id) => {
        const input = document.querySelector(
          `[data-testid="center-pokemon-${id}"]`,
        );
        if (!input || input.disabled)
          throw new Error("Cannot select the healing target");
        input.click();
      },
      captureId,
    );
  };
  const review = async () => {
    await evalArgs(admin, () =>
      document.querySelector('[data-testid="center-review"]').click(),
    );
    await waitArgs(
      admin,
      () => {
        const b = document.querySelector('[data-testid="center-confirm"]');
        return b && !b.disabled;
      },
      "healing confirmation is ready",
    );
  };
  const confirmTwice = async () =>
    evalArgs(admin, () => {
      const b = document.querySelector('[data-testid="center-confirm"]');
      b.click();
      b.click();
    });
  const waitSaved = async (revision) => {
    await waitArgs(
      playerA,
      async (expected) => {
        const [{ store }, storage] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
        ]);
        const p = store.getState().party;
        return (
          !p.centerLock &&
          p.centerHealingRevision >= expected &&
          !storage.isLocalPartyMutationBlocked(p) &&
          !document.querySelector('[data-testid="center-healing-lock"]')
        );
      },
      "healing persisted, acknowledged and player unlocked",
      revision,
    );
    await waitArgs(
      admin,
      () =>
        document
          .querySelector('[data-testid="center-result"]')
          ?.textContent.includes("Recuperación guardada"),
      "admin observes the saved healing receipt",
    );
  };
  const backendWait = async (predicate, label) => {
    const deadline = Date.now() + 15000;
    while (!(await predicate())) {
      if (Date.now() > deadline) throw new Error(`Timeout: ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  };
  const damage = async () =>
    evalArgs(playerA, async () => {
      const [{ transactPvpParty }, storage] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/store/accountStorage.ts"),
      ]);
      await transactPvpParty(2, async (current) => {
        const p = JSON.parse(JSON.stringify(current));
        p.pokemons.forEach((capture, index) => {
          capture.pokemon.stats.find((s) => s.name === "hp").value =
            index === 1 ? 0 : 7 + index;
          capture.statuses = index === 1 ? [] : ["poisoned", "confused"];
          capture.statusTurns = index === 1 ? {} : { confused: 3 };
          capture.pokemon.battleStages = {
            ...capture.pokemon.battleStages,
            attack: -3,
            speed: 2,
            accuracy: -1,
          };
          capture.moves.forEach((m) => {
            m.currentPp = 0;
          });
        });
        p.pvpRevision = storage.pvpPartyRevision(current) + 1;
        return { party: p, value: undefined };
      });
    });
  const expectedHealed = async (before, ids) => {
    const maxima = await evalArgs(playerA, async () => {
      const [{ store }, stats] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/lib/pokemonStats.ts"),
      ]);
      return store
        .getState()
        .party.pokemons.map((c) => [c.captureId, stats.getMaxHp(c.pokemon)]);
    });
    const max = new Map(maxima);
    return before.pokemons.map((entry) => {
      if (!ids.includes(entry.captureId)) return entry;
      const capture = structuredClone(entry);
      capture.pokemon.stats.find((s) => s.name === "hp").value = max.get(
        capture.captureId,
      );
      for (const key of Object.keys(capture.pokemon.battleStages))
        capture.pokemon.battleStages[key] = 0;
      capture.statuses = [];
      capture.statusTurns = {};
      capture.moves.forEach((move) => {
        move.currentPp = move.pp;
      });
      return capture;
    });
  };
  const publishStale = (receipt) => {
    const { requestHash: _, ...view } = receipt;
    for (const socket of shopGateway.namespace.sockets.values()) {
      if (socket.data.identity?.user.id === 2)
        socket.emit("shop:state", {
          centerHeals: [{ ...view, status: "pending" }],
        });
    }
  };
  const failAppliedStorage = async () =>
    evalArgs(playerA, () => {
      const original = Storage.prototype.setItem;
      window.__centerRestoreStorage = () => {
        Storage.prototype.setItem = original;
      };
      Storage.prototype.setItem = function (key, value) {
        if (key === "persist:root:user:2") {
          const p = JSON.parse(JSON.parse(value).party);
          if (p.centerLock?.applied)
            throw new Error("QA interrupted Poké Center checked save");
        }
        return original.call(this, key, value);
      };
    });
  const waitPending = async () => {
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="center-healing-lock"]'),
      "player remains safely locked after failed healing persistence",
    );
    await waitArgs(
      admin,
      () =>
        document
          .querySelector('[data-testid="center-result"]')
          ?.textContent.includes("Esperando"),
      "admin observes the durable pending healing receipt",
    );
    const row = await shopRepository.get(2);
    assert.equal(row.centerHeals.at(-1).status, "pending");
    return row.centerHeals.at(-1);
  };

  await routeDashboard(playerA);
  await routeDashboard(admin);
  await seedPvpTeam(playerA, 3, 19, 1.3);
  await seedPvpTeam(playerB, 1, 22, 1.3);
  await damage();
  await clickButton(admin, "Poké Center");
  await waitArgs(
    admin,
    () => !!document.querySelector('[data-testid="admin-center"]'),
    "Poké Center panel beside Tienda",
  );
  assert.equal(
    await evalArgs(admin, () =>
      getComputedStyle(
        document.querySelector(".admin-center-scene"),
      ).backgroundImage.includes("pokecenter-firered.png"),
    ),
    true,
  );
  await choose();
  for (const [label, width, height] of [
    ["desktop", 1280, 960],
    ["narrow", 375, 844],
  ]) {
    await cdp.request(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      admin,
    );
    const metrics = await cdp.request("Page.getLayoutMetrics", {}, admin);
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const shot = await cdp.request(
      "Page.captureScreenshot",
      {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
      },
      admin,
    );
    const path = join(tmpdir(), `pokemon-center-${label}.png`);
    await writeFile(path, Buffer.from(shot.data, "base64"));
    console.log(`Poké Center visual QA ${label}: ${path}`);
    const dimensions = await evalArgs(admin, () => ({
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      elements: [
        ".admin-shop-page",
        ".admin-center-scene",
        ".admin-center-menu",
        ".admin-mart-players",
      ].map((selector) => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return {
          selector,
          width: box.width,
          left: box.left,
          right: box.right,
          scrollWidth: element.scrollWidth,
        };
      }),
    }));
    assert.ok(
      dimensions.scrollWidth <= dimensions.viewport,
      `${label} Poké Center has no horizontal overflow`,
    );
    console.log(
      `Poké Center dimensions ${label}: ${JSON.stringify(dimensions)}`,
    );
  }
  await cdp.request(
    "Emulation.setDeviceMetricsOverride",
    { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false },
    admin,
  );
  if (process.argv.includes("--center-visual-only")) return;
  const original = await state();
  const walletBefore = await shopRepository.get(2);
  const ids = original.pokemons.map((c) => c.captureId);
  await selectCapture(ids[0]);
  await selectCapture(ids[1]);
  assert.equal(
    await evalArgs(
      admin,
      (id) =>
        document.querySelector(`[data-testid="center-pokemon-${id}"]`).disabled,
      ids[2],
    ),
    true,
    "two selections prevent a third target",
  );
  await review();
  await clickButton(admin, "Volver", "[role=dialog]");
  assert.deepEqual(
    (await state()).pokemons,
    original.pokemons,
    "closing preview does not heal",
  );
  assert.equal(
    (await shopRepository.get(2)).centerHeals?.length ?? 0,
    walletBefore.centerHeals?.length ?? 0,
  );
  await review();
  await confirmTwice();
  const firstRevision = (walletBefore.centerRevision ?? 0) + 1;
  await waitSaved(firstRevision);
  const first = await shopRepository.get(2);
  assert.equal(
    first.centerHeals.length,
    (walletBefore.centerHeals?.length ?? 0) + 1,
  );
  assert.equal(first.centerHeals.at(-1).status, "applied");
  assert.deepEqual(
    (await state()).pokemons,
    await expectedHealed(original, ids.slice(0, 2)),
  );
  for (const key of ["balance", "revision", "items", "purchases"])
    assert.deepEqual(
      first[key],
      walletBefore[key],
      `healing preserves wallet ${key}`,
    );
  assert.deepEqual(
    (await state()).bag,
    original.bag,
    "healing consumes neither Pokedollars nor Bag objects",
  );
  assert.deepEqual(
    (await state()).pokemons[2],
    original.pokemons[2],
    "third Pokémon is unchanged",
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitSaved(firstRevision);
  publishStale(first.centerHeals.at(-1));
  await waitSaved(firstRevision);
  assert.equal(
    (await shopRepository.get(2)).centerHeals.length,
    first.centerHeals.length,
  );
  await choose();
  await selectCapture(ids[2]);
  await review();
  await confirmTwice();
  await waitSaved(firstRevision + 1);
  assert.deepEqual(
    (await state()).pokemons,
    await expectedHealed(original, ids),
    "free immediate next iteration heals a single remaining Pokémon",
  );
  console.log(
    "PASS: Poké Center authentic background/online team, maximum2 with KO/HP/PP/status/stages, unchanged third/progression/Bag/Pokedollars, cancel preview, double-click, immediate free repeat1 and reload/stale pending fencing.",
  );

  // An active encounter excludes recovery before the local reservation.
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
    ]);
    await transactPvpParty(2, async (current) => ({
      party: {
        ...current,
        opponent: {
          kind: "trainer",
          pokemon: current.pokemons[0].pokemon,
          moves: current.pokemons[0].moves,
          statuses: [],
          stages: {},
          encounterId: "center-busy",
        },
        pvpRevision: storage.pvpPartyRevision(current) + 1,
      },
      value: undefined,
    }));
  });
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[data-testid="center-player-2"]')
        ?.textContent.includes("En batalla"),
    "local battle blocks Poké Center",
  );
  assert.equal(
    await evalArgs(
      admin,
      (selector) => document.querySelector(selector).disabled,
      button(2),
    ),
    true,
  );
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
    ]);
    await transactPvpParty(2, async (current) => ({
      party: {
        ...current,
        opponent: null,
        pvpRevision: storage.pvpPartyRevision(current) + 1,
      },
      value: undefined,
    }));
  });
  await waitReady();
  const oldActors = [...shopService.actors.values()].filter(
    (actor) => actor.user.id === 3,
  );
  for (const actor of oldActors) actor.supportsCenterHealing = false;
  await shopGateway.publish();
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[data-testid="center-player-3"]')
        ?.textContent.includes("Actualiza y recarga"),
    "old frontend capability is rejected before healing",
  );
  assert.equal(
    await evalArgs(
      admin,
      (selector) => document.querySelector(selector).disabled,
      button(3),
    ),
    true,
  );
  for (const actor of oldActors) actor.supportsCenterHealing = true;
  await shopGateway.publish();

  await damage();
  const damagedBeforeRecovery = await state();
  await choose();
  await selectCapture(ids[0]);
  await review();
  await failAppliedStorage();
  await confirmTwice();
  const interrupted = await waitPending();
  assert.deepEqual(
    (await state()).pokemons,
    damagedBeforeRecovery.pokemons,
    "failed checked storage preserves the old resources",
  );
  assert.equal(
    await evalArgs(
      admin,
      (selector) => document.querySelector(selector).disabled,
      button(2),
    ),
    true,
    "a pending operation prevents another attention",
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitSaved(interrupted.centerRevision);
  assert.deepEqual(
    (await state()).pokemons,
    await expectedHealed(damagedBeforeRecovery, [ids[0]]),
  );
  const recovered = await shopRepository.get(2);
  assert.equal(recovered.centerHeals.at(-1).requestId, interrupted.requestId);
  assert.equal(recovered.centerHeals.at(-1).status, "applied");
  await cdp.request("Page.reload", {}, playerA);
  await waitSaved(interrupted.centerRevision);
  assert.equal(
    (await shopRepository.get(2)).centerHeals.length,
    recovered.centerHeals.length,
  );
  console.log(
    "PASS: battle/old frontend/pending exclusions and interrupted checked-save recovery use the original durable healing plan once after reload.",
  );

  await damage();
  const damagedBeforeCancel = await state();
  await choose();
  await selectCapture(ids[1]);
  await review();
  await failAppliedStorage();
  await confirmTwice();
  const cancelledPending = await waitPending();
  await evalArgs(admin, () =>
    document.querySelector('[data-testid="center-cancel"]').click(),
  );
  await waitArgs(
    admin,
    () => !!document.querySelector('[data-testid="center-cancel-confirm"]'),
    "explicit cancellation asks for confirmation",
  );
  await evalArgs(admin, () =>
    document.querySelector('[data-testid="center-cancel-confirm"]').click(),
  );
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        !p.centerLock &&
        !document.querySelector('[data-testid="center-healing-lock"]')
      );
    },
    "cancelled receipt releases the player without discarding the Party",
  );
  await backendWait(
    async () =>
      (await shopRepository.get(2)).centerHeals.at(-1).status === "cancelled",
    "durable centre cancellation",
  );
  assert.deepEqual(
    (await state()).pokemons,
    damagedBeforeCancel.pokemons,
    "cancellation before persisted effect keeps damaged resources",
  );
  assert.deepEqual((await state()).bag, damagedBeforeCancel.bag);
  const actor = [...shopService.actors.values()].find((a) => a.user.id === 2);
  await shopService.centerApplied(actor, {
    requestId: cancelledPending.requestId,
    centerRevision: cancelledPending.centerRevision,
    planHash: cancelledPending.planHash,
  });
  assert.equal(
    (await shopRepository.get(2)).centerHeals.at(-1).status,
    "cancelled",
    "late ACK cannot revive a cancelled attention",
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async (r) => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        !p.centerLock &&
        p.centerHealingRevision >= r &&
        !document.querySelector('[data-testid="center-healing-lock"]')
      );
    },
    "cancelled recovery remains released after reload",
    cancelledPending.centerRevision,
  );
  publishStale(cancelledPending);
  await shopGateway.publish();
  await waitReady();
  assert.deepEqual((await state()).pokemons, damagedBeforeCancel.pokemons);
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
  console.log(
    "PASS: explicit pending cancellation preserves Party/items/Pokedollars, releases the game and rejects late ACK, stale pending and reload replays.",
  );

  // The player may close an attention whose effect is saved while the ACK is
  // still in flight. Closing never damages a Pokémon that was already healed.
  await damage();
  const beforeHeld = await state();
  const originalApplied = shopService.centerApplied;
  let held = false;
  let release;
  const appliedGate = new Promise((resolve) => {
    release = resolve;
  });
  shopService.centerApplied = async function (...args) {
    held = true;
    await appliedGate;
    return originalApplied.apply(this, args);
  };
  try {
    await choose();
    await selectCapture(ids[0]);
    await review();
    await confirmTwice();
    const pendingHeld = await waitPending();
    await backendWait(
      () => held,
      "the saved effect's ACK enters its delivery gate",
    );
    assert.equal((await state()).centerLock?.applied, true);
    const healedBeforeClose = (await state()).pokemons;
    assert.deepEqual(
      healedBeforeClose,
      await expectedHealed(beforeHeld, [ids[0]]),
    );
    await evalArgs(playerA, () =>
      document
        .querySelector(
          '[data-testid="center-healing-lock"] [data-testid="center-cancel"]',
        )
        .click(),
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="center-cancel-confirm"]'),
      "player can review cancellation over the healing gate",
    );
    await evalArgs(playerA, () =>
      document.querySelector('[data-testid="center-cancel-confirm"]').click(),
    );
    await waitArgs(
      playerA,
      async () =>
        !(await import("/src/store/store.ts")).store.getState().party
          .centerLock &&
        !document.querySelector('[data-testid="center-healing-lock"]'),
      "player closes a saved effect whose ACK was interrupted",
    );
    assert.deepEqual((await state()).pokemons, healedBeforeClose);
    assert.equal(
      (await shopRepository.get(2)).centerHeals.at(-1).status,
      "cancelled",
    );
    shopService.centerApplied = originalApplied;
    release();
    await shopGateway.publish();
    publishStale(pendingHeld);
    await cdp.request("Page.reload", {}, playerA);
    await waitReady();
    assert.deepEqual((await state()).pokemons, healedBeforeClose);
    assert.deepEqual((await state()).bag, beforeHeld.bag);
  } finally {
    shopService.centerApplied = originalApplied;
    release();
  }
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
  console.log(
    "PASS: player cancellation remains usable above the blocking dialog, preserves an already-saved heal, and a held late ACK never reapplies the effect.",
  );
}
