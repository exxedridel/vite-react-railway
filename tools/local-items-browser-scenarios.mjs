import assert from "node:assert/strict";
import { waitLocalItemFlush } from "./legacy-item-browser-fixture.mjs";

/** A real player keeps playing while the isolated relay delays or loses batches. */
export async function runLocalItemsBrowserScenario({
  admin, playerA, cdp, evalArgs, waitArgs, field, clickButton,
  seedPvpTeam, shopRepository, shopService, shopGateway, backendUrl,
}) {
  const origin = await evalArgs(playerA, () => location.origin);
  const socketOrigin = backendUrl ?? `http://127.0.0.1:${shopGateway.namespace.server.httpServer.address().port}`;
  const state = () => evalArgs(playerA, async () => JSON.parse(JSON.stringify(
    (await import("/src/store/store.ts")).store.getState().party,
  )));
  const until = async (check, label) => {
    const deadline = Date.now() + 20000;
    do {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    } while (Date.now() < deadline);
    throw new Error(`Timeout: ${label}`);
  };
  const route = async (page, path = "/dashboard") => {
    await cdp.request("Page.stopLoading", {}, page);
    await cdp.request("Page.navigate", { url: origin + path }, page);
    await waitArgs(page, async (path) => location.pathname === path &&
      !!document.querySelector(path === "/dashboard" ? 'a[href="/mensajes-prueba"]' : "main") &&
      (await import("/src/store/accountStorage.ts")).getActiveAccountId() !== null,
    "local items page and saved account loaded", path);
  };
  const noGate = async () => assert.equal(await evalArgs(playerA, () => !!document.querySelector(
    '[data-testid="item-use-lock"], [data-testid="shop-party-lock"], [data-testid="shop-gift-lock"], [data-testid="shop-reset-lock"], [data-testid="capture-roll-pending"]',
  )), false, "a background item batch never covers or replaces the game");
  const fixture = async (name, wild = false, hp = 100) => evalArgs(playerA, async (name, wild, hp) => {
    const [{ transactPvpParty }, storage, fields, catalog] = await Promise.all([
      import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
      import("/src/lib/battleField.ts"), import("/src/lib/trainerBattle/catalog.ts"),
    ]);
    await transactPvpParty(2, async (current) => {
      if (current.itemUseLock || current.shopLock || current.resetLock ||
        current.centerLock || current.pvpLock || current.captureAttempt)
        throw new Error("Local inventory fixture cannot discard an operation lock");
      const party = JSON.parse(JSON.stringify(current));
      const own = party.pokemons[0];
      own.pokemon.stats.find((s) => s.name === "hp").value = hp;
      own.statuses = []; own.statusTurns = {}; own.pokemon.battleStages = {};
      own.pokemon.learnset = { versionGroup: "emerald", moves: [150, 33, 45].map((id) => ({
        id, name: catalog.trainerMoves.find((m) => m.id === id).name,
      })) };
      own.moves ??= [];
      for (const id of [150, 33]) {
        const move = own.moves.find((m) => m.id === id);
        if (!move) own.moves.push({ ...catalog.trainerMoves.find((m) => m.id === id), source: "tm", currentPp: id === 150 ? 17 : 5 });
        else move.currentPp = id === 150 ? 17 : 5;
      }
      const pokemon = JSON.parse(JSON.stringify(own.pokemon));
      pokemon.stats.find((s) => s.name === "hp").value = 22;
      party.opponent = wild ? {
        kind: "wild", encounterId: name, pokemon,
        automation: { enabled: true, catalogRevision: 0 },
        moves: [{ ...catalog.trainerMoves.find((m) => m.id === 33), currentPp: 12, source: "wild" }],
        statuses: [], statusTurns: {}, stages: {},
      } : null;
      party.emerald = undefined; party.lastEmeraldBatch = undefined;
      party.lastMovesByPlayer = {}; party.lastOpponentMove = null;
      party.battleField = fields.emptyBattleField();
      party.starterClaimed = true;
      party.pvpRevision = storage.pvpPartyRevision(current) + 1;
      return { party, value: undefined };
    });
  }, name, wild, hp);
  const openBattle = async () => {
    await route(playerA);
    await waitArgs(playerA, () => !!document.querySelector('button[aria-label="Abrir combate de clefairy"]'),
      "local battle trigger ready");
    await evalArgs(playerA, () => document.querySelector('button[aria-label="Abrir combate de clefairy"]').click());
    await waitArgs(playerA, () => !!document.querySelector(".battle-scene"), "local arena mounted");
  };
  const highlights = async () => {
    await waitArgs(playerA, () => [...document.querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "Volver al combate",
    ), "native local action finished its own turn");
    await clickButton(playerA, "Volver al combate", '[role="dialog"]');
  };
  const useBattleItem = async (item) => {
    await evalArgs(playerA, () => { document.querySelector('[data-testid="battle-items"]').open = true; });
    if (item === "max-ether")
      await field(playerA, 'select[aria-label="Movimiento para Max Ether"]', "150");
    await waitArgs(playerA, (item) => {
      const b = document.querySelector(`[data-testid="battle-${item}"]`);
      return b && !b.disabled;
    }, `local ${item} can be used without a batch response`, item);
    await evalArgs(playerA, (item) => document.querySelector(`[data-testid="battle-${item}"]`).click(), item);
    await highlights();
    await noGate();
  };
  const splash = async () => {
    await evalArgs(playerA, () => {
      const details = [...document.querySelectorAll("details")].find(
        (d) => d.querySelector("summary")?.textContent.trim() === "BATTLE MOVES",
      );
      details.open = true;
      const article = [...details.querySelectorAll("article")].find(
        (a) => a.querySelector("h3")?.textContent.trim() === "Splash",
      );
      [...article.querySelectorAll("button")].find((b) => b.textContent.trim() === "Usar movimiento").click();
    });
    await clickButton(playerA, "Elegir movimiento", '[role="dialog"]');
    await highlights();
  };
  const restoreOutside = async () => {
    await waitArgs(playerA, () => !!document.querySelector('button[aria-label="Acciones de clefairy"]'),
      "outside item action ready");
    await evalArgs(playerA, () => document.querySelector('button[aria-label="Acciones de clefairy"]').click());
    await waitArgs(playerA, () => {
      const b = document.querySelector('button[aria-label="Usar Full Restore en clefairy"]');
      return b && !b.disabled;
    }, "local Full Restore is available");
    await evalArgs(playerA, () => {
      const b = document.querySelector('button[aria-label="Usar Full Restore en clefairy"]');
      b.click(); b.click();
    });
  };
  const forceD20 = (value) => evalArgs(playerA, (value) => {
    window.__qaD20Original ??= crypto.getRandomValues.bind(crypto);
    window.__qaD20Draws = 0;
    crypto.getRandomValues = function (array) {
      if (array instanceof Uint32Array && array.length === 1) {
        window.__qaD20Draws++;
        array[0] = value - 1;
        return array;
      }
      return window.__qaD20Original(array);
    };
  }, value);
  const openBalls = async () => {
    await openBattle();
    await clickButton(playerA, "Oponente", '[role="dialog"]');
    await waitArgs(playerA, () => {
      const b = document.querySelector('[data-testid="capture-open"]');
      return b && !b.disabled;
    }, "local ball inventory can be opened without Nest");
    await evalArgs(playerA, () => document.querySelector('[data-testid="capture-open"]').click());
    await waitArgs(playerA, () => !!document.querySelector('[data-testid="capture-ball-poke-ball"]'),
      "direct ball picker opened");
    assert.equal(await evalArgs(playerA, () => !!document.querySelector('[data-testid="capture-throw-confirm"]')),
      false, "one ball click launches directly without a second confirmation");
  };
  const throwBall = async (id, roll) => {
    await forceD20(roll);
    const previous = (await state()).lastCaptureResult?.attemptId;
    await evalArgs(playerA, (id) => {
      const b = document.querySelector(`[data-testid="capture-ball-${id}"]`);
      if (!b || b.disabled) throw new Error("Chosen ball has no valid stock/threshold");
      b.click(); b.click();
    }, id);
    await waitArgs(playerA, async (previous, roll) => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return p.lastCaptureResult?.attemptId !== previous && p.lastCaptureResult?.roll === roll;
    }, "direct click stores its exact D20 outcome locally", previous ?? null, roll);
    await waitArgs(playerA, (roll) => [...document.querySelectorAll('[data-testid="capture-auto-result"]')]
      .some((node) => node.textContent.includes(`D20: ${roll} `)),
    "D20 feedback is shown after the checked local commit", roll);
    assert.equal(await evalArgs(playerA, () => window.__qaD20Draws), 1,
      "double click draws exactly one D20 and leaves battle RNG independent");
    await noGate();
    return (await state()).lastCaptureResult;
  };

  await route(playerA);
  await waitLocalItemFlush({ playerA, waitArgs });
  await seedPvpTeam(playerA, 1, 40, 2);
  await fixture("local-items-setup", false, 40);
  const initial = await shopRepository.get(2), prior = initial.storageRevision;
  initial.balance = 2000;
  initial.items = { ...initial.items, "full-restore": 3, "max-ether": 2,
    "max-elixir": 1, tm: 1, "poke-ball": 1, "great-ball": 1, "ultra-ball": 1 };
  initial.revision++; initial.storageRevision++;
  assert.equal(await shopRepository.compareAndSwap(initial, prior), true);
  await shopGateway.publish();
  await waitArgs(playerA, async (revision) => {
    const p = (await import("/src/store/store.ts")).store.getState().party;
    return p.bag.walletRevision === revision && !!p.bag.consumptionAck;
  }, "background consumption protocol initialized", initial.revision);
  const originalBatch = shopService.consumeBatch;
  const originalUse = shopService.use, originalApplied = shopService.useApplied;
  let legacyUseCalls = 0, legacyAppliedCalls = 0, mode = "before", releaseBefore, releaseAfter;
  let enteredBefore = false, enteredAfter = false;
  const beforeGate = new Promise((resolve) => { releaseBefore = resolve; });
  const afterGate = new Promise((resolve) => { releaseAfter = resolve; });
  const batches = [];
  shopService.use = function (...args) { legacyUseCalls++; return originalUse.apply(this, args); };
  shopService.useApplied = function (...args) { legacyAppliedCalls++; return originalApplied.apply(this, args); };
  shopService.consumeBatch = async function (actor, payload) {
    const phase = mode;
    batches.push({ actor, payload: JSON.parse(JSON.stringify(payload)) });
    if (phase === "before") { enteredBefore = true; await beforeGate; }
    const result = await originalBatch.call(this, actor, payload);
    if (phase === "after") { enteredAfter = true; await afterGate; }
    return result;
  };
  try {
    await restoreOutside();
    await waitArgs(playerA, async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return p.bag.items["full-restore"] === 2 && p.localItemOutbox?.operations.length === 1 &&
        p.pokemons[0].pokemon.stats.find((s) => s.name === "hp").value === 100;
    }, "local heal and one debit finish before the held network batch");
    await until(() => enteredBefore, "first background batch is held before commit");
    assert.equal((await shopRepository.get(2)).items["full-restore"], 3);
    await noGate();
    await until(() => [...shopService.actors.values()].some((a) => a.user.id === 2 && !a.ready && a.pendingConsumption),
      "pending outbox is reported as not ready for administrator operations");
    await route(admin, "/back-office");
    await waitArgs(admin, () => !!document.querySelector('[data-testid="gift-player"] option[value="2"]'),
      "pending player remains visible to administrator");
    await field(admin, '[data-testid="gift-player"]', "2");
    assert.equal(await evalArgs(admin, () => document.querySelector('[data-testid="gift-open"]').disabled), true,
      "administrator cannot gift stock before the pending consumption flushes");
    await route(admin);
    await clickButton(admin, "Tienda");
    await waitArgs(admin, () => document.querySelector('[data-testid="shop-player-2"] button[aria-pressed]')?.disabled,
      "administrator cannot buy for a pending player");
    await fixture("held-batch-battle", true, 100);
    await openBattle();
    await evalArgs(playerA, async () => {
      const { BattleMusic } = await import("/src/lib/battleMusic.ts");
      const arena = document.querySelector(".battle-scene");
      const saved = window.__qaLocalAudio = { arena, dialog: arena.closest('[role="dialog"]'),
        unlock: BattleMusic.prototype.unlock, close: AudioContext.prototype.close,
        stop: AudioBufferSourceNode.prototype.stop, closes: 0, stops: 0 };
      BattleMusic.prototype.unlock = function (...args) { saved.engine = this; return saved.unlock.apply(this, args); };
      AudioContext.prototype.close = function (...args) { saved.closes++; return saved.close.apply(this, args); };
      AudioBufferSourceNode.prototype.stop = function (...args) { saved.stops++; return saved.stop.apply(this, args); };
    });
    const point = await evalArgs(playerA, () => {
      const box = window.__qaLocalAudio.dialog.querySelector("h2").getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    for (const type of ["mousePressed", "mouseReleased"])
      await cdp.request("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, playerA);
    await waitArgs(playerA, () => window.__qaLocalAudio.engine?.context?.state === "running" &&
      !!window.__qaLocalAudio.engine.source, "trusted gesture starts real battle audio");
    await evalArgs(playerA, () => {
      const s = window.__qaLocalAudio;
      s.context = s.engine.context; s.source = s.engine.source; s.clock = s.context.currentTime;
      s.closes = s.stops = 0;
    });
    await useBattleItem("max-ether");
    await splash();
    await useBattleItem("max-elixir");
    await useBattleItem("full-restore");
    let p = await state();
    assert.equal(p.bag.items["full-restore"], 1);
    assert.equal(p.bag.items["max-ether"], 1);
    assert.equal(p.bag.items["max-elixir"], 0);
    assert.equal(p.localItemOutbox.operations.length, 4);
    assert.equal(p.opponent.moves[0].currentPp, 8, "items and a normal move each get one rival response");
    assert.equal(p.pokemons[0].moves.find((m) => m.id === 150).currentPp, 40);
    assert.deepEqual(await evalArgs(playerA, () => {
      const s = window.__qaLocalAudio;
      return { mounted: s.arena.isConnected && document.querySelector(".battle-scene") === s.arena,
        same: s.engine.source === s.source && s.engine.context === s.context,
        running: s.context.state === "running", advanced: s.context.currentTime > s.clock,
        closes: s.closes, stops: s.stops };
    }), { mounted: true, same: true, running: true, advanced: true, closes: 0, stops: 0 });
    await evalArgs(playerA, async () => {
      const s = window.__qaLocalAudio;
      const { BattleMusic } = await import("/src/lib/battleMusic.ts");
      BattleMusic.prototype.unlock = s.unlock; AudioContext.prototype.close = s.close;
      AudioBufferSourceNode.prototype.stop = s.stop;
    });
    mode = "normal"; releaseBefore();
    await waitLocalItemFlush({ playerA, waitArgs });
    const flushed = await shopRepository.get(2);
    assert.equal(flushed.items["full-restore"], 1);
    assert.equal(flushed.items["max-ether"], 1);
    assert.equal(flushed.items["max-elixir"], 0);
    assert.equal(flushed.balance, 2000);
    console.log("PASS: held background batches never block local healing, PP items, further turns or arena/music; administrator purchasing/gifting waits for the consumption barrier.");

    await route(playerA); await fixture("ack-overlay", false, 40);
    mode = "after";
    await restoreOutside();
    await until(() => enteredAfter, "server committed a batch whose ACK is still held");
    assert.equal((await shopRepository.get(2)).items["full-restore"], 0);
    await shopGateway.publish();
    await waitArgs(playerA, async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag.items["full-restore"] === 0,
    "post-commit snapshot neither double-subtracts nor restores pending inventory");
    mode = "normal"; releaseAfter();
    await waitLocalItemFlush({ playerA, waitArgs });
    const replayBatch = batches.at(-1);
    const beforeReplay = await shopRepository.get(2);
    await originalBatch.call(shopService, replayBatch.actor, replayBatch.payload);
    const afterReplay = await shopRepository.get(2);
    assert.equal(afterReplay.revision, beforeReplay.revision);
    assert.deepEqual(afterReplay.items, beforeReplay.items);
    await noGate();
    console.log("PASS: committed snapshots and replayed background ACKs preserve net stock without crediting or debiting an item twice.");

    await cdp.request("Network.enable", {}, playerA);
    await cdp.request("Network.setBlockedURLs", { urls: [`${socketOrigin}/socket.io/*`] }, playerA);
    await route(playerA);
    await waitArgs(playerA, async () => {
      const [{ store }, storage] = await Promise.all([
        import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
      ]);
      return storage.getActiveAccountId() === 2 && !!store.getState().party.bag.consumptionAck;
    }, "saved local inventory works while only the Nest connection is blocked");
    await openBattle();
    await evalArgs(playerA, async () => {
      const [{ store }, { pokeApi }, { trainerMoves }] = await Promise.all([
        import("/src/store/store.ts"), import("/src/api/pokeApi.ts"),
        import("/src/lib/trainerBattle/catalog.ts"),
      ]);
      for (const id of [150, 33, 45])
        await store.dispatch(pokeApi.util.upsertQueryData("getMove", id, trainerMoves.find((m) => m.id === id)));
    });
    await evalArgs(playerA, () => {
      [...document.querySelectorAll("details")].find((d) => d.querySelector("summary")?.textContent.trim() === "BATTLE MOVES").open = true;
      const button = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Aprender con TM");
      if (!button || button.disabled) throw new Error("A local TM must remain usable without Nest");
      button.click();
    });
    await waitArgs(playerA, () => [...document.querySelectorAll('[aria-label="Movimientos compatibles"] button')]
      .some((b) => b.textContent.includes("Growl")), "offline Nest does not block cached TM choices");
    await evalArgs(playerA, () => [...document.querySelectorAll('[aria-label="Movimientos compatibles"] button')]
      .find((b) => b.textContent.includes("Growl")).click());
    await evalArgs(playerA, () => {
      const b = document.querySelector('[data-testid="tm-confirm"]');
      if (!b || b.disabled) throw new Error("Local TM confirmation unavailable");
      b.click(); b.click();
    });
    await waitArgs(playerA, async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return p.bag.items.tm === 0 && p.pokemons[0].moves.some((m) => m.id === 45) && p.localItemOutbox.operations.length === 1;
    }, "TM learns and spends locally while Nest is unavailable");
    await noGate();
    await route(playerA); await fixture("automatic-d20-offline", true, 100);
    const beforeMiss = await state();
    await openBalls();
    const miss = await throwBall("poke-ball", 1);
    assert.equal(miss.outcome, "escaped");
    assert.ok(miss.minimum > 1);
    p = await state();
    assert.equal(p.bag.items["poke-ball"], 0);
    assert.equal(p.opponent.moves[0].currentPp, 11);
    assert.equal(p.pokemons[0].moves[0].currentPp, beforeMiss.pokemons[0].moves[0].currentPp);
    const missPp = p.opponent.moves[0].currentPp;
    await route(playerA);
    assert.equal((await state()).lastCaptureResult.roll, 1);
    assert.equal((await state()).opponent.moves[0].currentPp, missPp,
      "reload never rerolls the die or repeats the failed throw's response");
    await openBalls();
    assert.equal(await evalArgs(playerA, () => document.querySelector('[data-testid="capture-ball-poke-ball"]').disabled), true);
    const caught = await throwBall("great-ball", 20);
    assert.equal(caught.outcome, "caught");
    p = await state();
    const capturedId = caught.captureId;
    assert.equal(p.pokemons.length, beforeMiss.pokemons.length + 1);
    assert.equal(p.bag.items["great-ball"], 0);
    assert.equal(p.opponent, null);
    const pending = JSON.parse(JSON.stringify(p.localItemOutbox));
    await route(playerA);
    p = await state();
    assert.equal(p.lastCaptureResult.roll, 20);
    assert.equal(p.lastCaptureResult.minimum, caught.minimum);
    assert.equal(p.pokemons.filter((m) => m.captureId === capturedId).length, 1);
    assert.deepEqual(p.localItemOutbox, pending, "offline reload keeps operation IDs and sequence exactly");

    // Another device used the last centrally available ball meanwhile. Backend
    // multi-client tests validate the competing real batch; here we validate UI recovery.
    const competing = await shopRepository.get(2), competingRevision = competing.storageRevision;
    competing.items["great-ball"] = 0; competing.revision++; competing.storageRevision++;
    assert.equal(await shopRepository.compareAndSwap(competing, competingRevision), true);
    await cdp.request("Network.setBlockedURLs", { urls: [] }, playerA);
    await route(playerA);
    await waitLocalItemFlush({ playerA, waitArgs });
    await waitArgs(playerA, async (operationId) => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return p.localItemConflicts?.some((c) => c.operationId === operationId) &&
        p.pokemons.some((m) => m.captureId === p.lastCaptureResult.captureId);
    }, "terminal stock conflict preserves local capture and clears the queue", pending.operations.at(-1).operationId);
    p = await state();
    assert.equal(p.bag.items["great-ball"], 0);
    assert.equal(p.pokemons.filter((m) => m.captureId === capturedId).length, 1);
    await noGate();
    assert.equal(legacyUseCalls, 0, "new local item UI never calls legacy shop:use");
    assert.equal(legacyAppliedCalls, 0, "new local item UI never requires a legacy item ACK");
    console.log("PASS: Nest-only outage leaves TM and direct D20 capture usable; 1/20 results, stock and identities survive reload, miss responds once and an insufficient-stock conflict terminates without undoing the capture.");
  } finally {
    mode = "normal"; releaseBefore(); releaseAfter();
    shopService.consumeBatch = originalBatch;
    shopService.use = originalUse; shopService.useApplied = originalApplied;
    await cdp.request("Network.setBlockedURLs", { urls: [] }, playerA).catch(() => {});
    await evalArgs(playerA, () => {
      if (window.__qaD20Original) crypto.getRandomValues = window.__qaD20Original;
    }).catch(() => {});
  }
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
}
