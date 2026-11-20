import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectCaptureBall, releaseCaptureBall, finishCapturePresentation } from "./capture-throw-browser-fixture.mjs";
import { waitLocalItemFlush } from "./legacy-item-browser-fixture.mjs";

/** Pointer/touch aiming, durable combat effects and live animation in Chrome. */
export async function runCaptureThrowBrowserScenario({
  playerA, cdp, evalArgs, waitArgs, clickButton, seedPvpTeam, partyState,
  frontendUrl, shopRepository, shopGateway,
}) {
  const state = () => partyState(playerA);
  const route = async () => {
    await cdp.request("Page.stopLoading", {}, playerA);
    await cdp.request("Page.navigate", { url: frontendUrl + "/dashboard" }, playerA);
    await waitArgs(playerA, async () => !!document.querySelector('a[href="/mensajes-prueba"]') &&
      (await import("/src/store/accountStorage.ts")).getActiveAccountId() === 2,
    "capture aiming account and saved party loaded");
  };
  const draws = () => evalArgs(playerA, () => window.__qaCaptureDraws);
  const screenshot = async (name) => {
    const result = await cdp.request("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, playerA);
    const path = join(tmpdir(), `pokemon-capture-aim-${name}.png`);
    await writeFile(path, Buffer.from(result.data, "base64"));
    console.log(`Capture aiming ${name}: ${path}`);
  };
  const forceRoll = async (face) => evalArgs(playerA, (face) => {
    window.__qaCaptureRandom ??= crypto.getRandomValues.bind(crypto);
    window.__qaCaptureDraws = 0;
    crypto.getRandomValues = function (array) {
      if (array instanceof Uint32Array && array.length === 1) {
        window.__qaCaptureDraws++;
        array[0] = face - 1;
        return array;
      }
      return window.__qaCaptureRandom(array);
    };
  }, face);
  const startAudio = async (touch) => {
    await waitArgs(playerA, () => document.querySelector(".battle-scene")?.closest('[role="dialog"]')?.getAnimations().every(
      (animation) => animation.playState !== "running"),
    "the battle entrance animation settles before trusted audio input");
    await evalArgs(playerA, async () => {
      const { BattleMusic } = await import("/src/lib/battleMusic.ts");
      const arena = document.querySelector(".battle-scene");
      const saved = window.__qaCaptureAudio = { arena, unlock: BattleMusic.prototype.unlock,
        stop: AudioBufferSourceNode.prototype.stop, close: AudioContext.prototype.close, stops: 0, closes: 0 };
      saved.pointerEvents = [];
      document.addEventListener("pointerdown", (event) => saved.pointerEvents.push({
        target: event.target.closest("[data-testid]")?.getAttribute("data-testid") ?? event.target.tagName,
        trusted: event.isTrusted, type: event.pointerType, x: event.clientX, y: event.clientY,
      }), { capture: true });
      BattleMusic.prototype.unlock = function (...args) { saved.engine = this; return saved.unlock.apply(this, args); };
      AudioBufferSourceNode.prototype.stop = function (...args) {
        if (this === saved.source) saved.stops++;
        return saved.stop.apply(this, args);
      };
      AudioContext.prototype.close = function (...args) {
        if (this === saved.context) saved.closes++;
        return saved.close.apply(this, args);
      };
    });
    // On mobile the real aiming touch is the first trusted user activation.
    // Its pointerdown starts audio before releasing, rather than tapping a
    // heading that can be outside the visual viewport of a nested dialog.
    if (touch) return;
    const point = await evalArgs(playerA, () => {
      const heading = window.__qaCaptureAudio.arena.closest('[role="dialog"]').querySelector("h2");
      heading.scrollIntoView({ block: "nearest" });
      const rect = heading.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    await cdp.request("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point }, playerA);
    await cdp.request("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point }, playerA);
    await armAudio();
  };
  const armAudio = async () => {
    const delivered = await evalArgs(playerA, () => {
      const saved = window.__qaCaptureAudio;
      return { engine: !!saved.engine, events: saved.pointerEvents, viewport: { width: innerWidth, height: innerHeight, scale: visualViewport.scale } };
    });
    if (!delivered.engine) throw new Error(`Trusted audio gesture missed the visible game: ${JSON.stringify(delivered)}`);
    await waitArgs(playerA, () => window.__qaCaptureAudio.engine?.context?.state === "running" &&
      !!window.__qaCaptureAudio.engine.source, "a trusted gesture starts real battle music");
    await evalArgs(playerA, () => {
      const saved = window.__qaCaptureAudio;
      saved.context = saved.engine.context; saved.source = saved.engine.source;
      saved.clock = saved.context.currentTime;
    });
  };
  const audioIntact = async () => assert.deepEqual(await evalArgs(playerA, () => {
    const saved = window.__qaCaptureAudio;
    return { arena: saved.arena.isConnected && document.querySelector(".battle-scene") === saved.arena,
      source: saved.engine.source === saved.source, context: saved.engine.context === saved.context,
      running: saved.context.state === "running", advancing: saved.context.currentTime > saved.clock,
      stops: saved.stops, closes: saved.closes };
  }), { arena: true, source: true, context: true, running: true, advancing: true, stops: 0, closes: 0 },
  "capture presentation preserves the arena and battle source/context without stopping its music");
  const openBalls = async (touch = false) => {
    await route();
    await waitArgs(playerA, () => !!document.querySelector('button[aria-label="Abrir combate de clefairy"]'),
      "capture throwing battle trigger ready");
    await evalArgs(playerA, () => document.querySelector('button[aria-label="Abrir combate de clefairy"]').click());
    await waitArgs(playerA, () => !!document.querySelector(".battle-scene"), "capture throwing arena ready");
    await startAudio(touch);
    await clickButton(playerA, "Oponente", '[role="dialog"]');
    await waitArgs(playerA, () => {
      const button = document.querySelector('[data-testid="capture-open"]'); return button && !button.disabled;
    }, "capture throwing inventory available");
    await evalArgs(playerA, () => document.querySelector('[data-testid="capture-open"]').click());
    await waitArgs(playerA, () => !!document.querySelector('[data-testid="capture-ball-poke-ball"]'),
      "capture throwing ball selection ready");
  };
  const watchPhases = async () => evalArgs(playerA, () => {
    const scene = document.querySelector('[data-testid="capture-throw-scene"]');
    window.__qaCaptureScene = scene;
    window.__qaCapturePhases = [scene.getAttribute("data-phase")];
    window.__qaCaptureObserver = new MutationObserver(() => {
      const phase = scene.getAttribute("data-phase");
      if (window.__qaCapturePhases.at(-1) !== phase) window.__qaCapturePhases.push(phase);
    });
    window.__qaCaptureObserver.observe(scene, { attributes: true, attributeFilter: ["data-phase"] });
  });
  const select = async (ballId, roll) => {
    const before = await state();
    await forceRoll(roll);
    await selectCaptureBall({ page: playerA, evalArgs, waitArgs, ballId });
    assert.deepEqual((await state()).bag.items, before.bag.items,
      "selecting a ball before the aiming release does not spend it");
    assert.equal(await draws(), 0);
    await watchPhases();
    return before;
  };
  const throwNow = async (hit, touch, before) => {
    await releaseCaptureBall({ page: playerA, cdp, evalArgs, hit, touch,
      beforeRelease: async () => {
        assert.deepEqual((await state()).bag.items, before.bag.items,
          "dragging without releasing does not debit inventory");
        assert.equal(await draws(), 0);
      } });
    // Touch activation can complete on touchend/pointerup; waiting for a
    // running context before releasing would deadlock the trusted gesture.
    if (touch) await armAudio();
    await waitArgs(playerA, async (previousId, hit) => {
      const result = (await import("/src/store/store.ts")).store.getState().party.lastCaptureResult;
      return result && result.attemptId !== previousId && result.throwHit === hit;
    }, "release saves the exact aim result and a single item debit", before.lastCaptureResult?.attemptId ?? null, hit);
    return state();
  };
  const blockDismissal = async () => {
    await cdp.request("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, playerA);
    await cdp.request("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, playerA);
    await cdp.request("Input.dispatchMouseEvent", { type: "mousePressed", x: 1, y: 1, button: "left", clickCount: 1 }, playerA);
    await cdp.request("Input.dispatchMouseEvent", { type: "mouseReleased", x: 1, y: 1, button: "left", clickCount: 1 }, playerA);
    assert.equal(await evalArgs(playerA, () => window.__qaCaptureScene.isConnected &&
      document.querySelector('[data-testid="capture-throw-scene"]') === window.__qaCaptureScene), true,
    "Escape and outside interaction cannot dismiss or remount an in-flight capture");
    assert.equal(await evalArgs(playerA, () => [...document.querySelectorAll('[role="dialog"]')].some(
      (dialog) => dialog.querySelector("h2")?.textContent === "Así fue el turno")), false,
    "enemy turn highlights do not cover the capture animation");
  };
  const finish = async (expectedRoll, expectedPhases) => {
    await waitArgs(playerA, () => !!document.querySelector('[data-testid="capture-throw-result"]'),
      "capture animation presents its result");
    const phases = await evalArgs(playerA, () => window.__qaCapturePhases);
    for (const phase of expectedPhases) assert(phases.includes(phase), `capture animation presents ${phase}`);
    await blockDismissal();
    await audioIntact();
    return finishCapturePresentation({ page: playerA, evalArgs, waitArgs, expectedRoll });
  };

  await route();
  await seedPvpTeam(playerA, 1, 100, 2);
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, field, stats, catalog] = await Promise.all([
      import("/src/store/store.ts"), import("/src/lib/battleField.ts"),
      import("/src/lib/pokemonStats.ts"), import("/src/lib/trainerBattle/catalog.ts"),
    ]);
    await transactPvpParty(2, async (party) => {
      const own = JSON.parse(JSON.stringify(party.pokemons[0]));
      own.statuses = []; own.statusTurns = {}; own.pokemon.battleStages = stats.neutralBattleStages();
      own.pokemon.stats.forEach((stat) => { if (stat.name !== "hp") stat.value = 500; });
      own.moves = [{ ...catalog.trainerMoves.find((move) => move.id === 150), source: "wild", currentPp: 40 }];
      const foe = stats.changeLevel(JSON.parse(JSON.stringify(own.pokemon)), 21);
      foe.stats.find((stat) => stat.name === "hp").value = 22;
      foe.learnset = { versionGroup: "emerald", moves: [{ id: 129, name: "swift" }] };
      return { party: { ...party, pokemons: [own], starterClaimed: true,
        opponent: { kind: "wild", encounterId: "capture-pointer-encounter", pokemon: foe,
          moves: [{ ...catalog.trainerMoves.find((move) => move.id === 129), source: "wild", currentPp: 20 }],
          automation: { enabled: true, catalogRevision: 0 }, statuses: [], statusTurns: {}, stages: stats.neutralBattleStages() },
        emerald: undefined, battleField: { ...field.emptyBattleField(), activeCaptureId: own.captureId },
        pvpRevision: party.pvpRevision + 1 }, value: undefined };
    });
  });
  const wallet = await shopRepository.get(2), previousRevision = wallet.storageRevision;
  wallet.items = { ...wallet.items, "poke-ball": 2, "great-ball": 2, "ultra-ball": 0 };
  wallet.revision++; wallet.storageRevision++;
  assert.equal(await shopRepository.compareAndSwap(wallet, previousRevision), true);
  await shopGateway.publish();
  await waitArgs(playerA, async () => (await import("/src/store/store.ts")).store.getState().party.bag.items["great-ball"] === 2,
    "capture pointer fixture stock is centrally confirmed");
  try {
    await openBalls();
    assert.equal(await evalArgs(playerA, () => document.querySelector('[data-testid="capture-ball-ultra-ball"]').disabled), true);
    const beforeMiss = await select("poke-ball", 20);
    const missed = await throwNow(false, false, beforeMiss);
    assert.equal(missed.lastCaptureResult.outcome, "escaped");
    assert.equal(missed.lastCaptureResult.roll, undefined);
    assert.equal(await draws(), 0, "missing the target never rolls the capture D20");
    assert.equal(missed.bag.items["poke-ball"], 1);
    assert.equal(missed.battleField.turn, 2);
    assert.equal(missed.opponent.moves[0].currentPp, 19);
    assert.equal(missed.pokemons[0].moves[0].currentPp, 40);
    await blockDismissal();
    await audioIntact();
    const savedMiss = JSON.parse(JSON.stringify(missed));
    await route();
    const reloadedMiss = await state();
    assert.deepEqual(reloadedMiss.lastCaptureResult, savedMiss.lastCaptureResult);
    assert.equal(reloadedMiss.bag.items["poke-ball"], 1);
    assert.equal(reloadedMiss.opponent.moves[0].currentPp, 19);
    assert.equal(reloadedMiss.battleField.turn, 2);
    assert.equal(reloadedMiss.pokemons.length, 1);
    console.log("PASS: desktop aiming miss spends exactly one ball/action with no D20, runs one enemy reply, blocks dismissal and reloads mid-flight without repeating any effect.");

    await openBalls();
    const beforeEscape = await select("great-ball", 1);
    await screenshot("desktop");
    const escaped = await throwNow(true, false, beforeEscape);
    assert.equal(escaped.lastCaptureResult.roll, 1);
    assert(escaped.lastCaptureResult.minimum > 1);
    assert.equal(escaped.lastCaptureResult.outcome, "escaped");
    assert.equal(escaped.bag.items["great-ball"], 1);
    assert.equal(escaped.opponent.moves[0].currentPp, 18);
    assert.equal(escaped.battleField.turn, 3);
    await blockDismissal();
    // Extra pointer activity during flight cannot launch a second operation.
    const retryPoint = await evalArgs(playerA, () => {
      const box = document.querySelector('[data-testid="capture-throw-scene"]').getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.bottom - 40 };
    });
    await cdp.request("Input.dispatchMouseEvent", { type: "mousePressed", ...retryPoint, button: "left", clickCount: 1 }, playerA);
    await cdp.request("Input.dispatchMouseEvent", { type: "mouseReleased", ...retryPoint, button: "left", clickCount: 1 }, playerA);
    await finish(1, ["flight", "shake", "breakout", "result"]);
    assert.equal(await draws(), 1);
    assert.deepEqual((await state()).lastCaptureResult, escaped.lastCaptureResult);
    assert.equal((await state()).bag.items["great-ball"], 1);
    console.log("PASS: a desktop hit rolls once, failed D20 shakes and breaks out, spends one ball/turn and attacks once; repeated input never replays the throw and music remains continuous.");

    await cdp.request("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }, playerA);
    await cdp.request("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 }, playerA);
    await openBalls(true);
    const beforeTouchMiss = await select("poke-ball", 20);
    await screenshot("mobile");
    const touchMiss = await throwNow(false, true, beforeTouchMiss);
    assert.equal(touchMiss.lastCaptureResult.throwHit, false);
    assert.equal(touchMiss.lastCaptureResult.roll, undefined);
    assert.equal(touchMiss.bag.items["poke-ball"], 0);
    assert.equal(touchMiss.opponent.moves[0].currentPp, 17);
    assert.equal(touchMiss.battleField.turn, 4);
    await finish(undefined, ["flight", "result"]);
    assert.equal(await draws(), 0);
    assert.equal(await evalArgs(playerA, () => document.documentElement.scrollWidth <= innerWidth), true,
      "mobile capture layout stays within its 375px viewport");
    console.log("PASS: real mobile touch release outside the target follows the same stock/action/no-D20 rules and fits the narrow viewport.");

    await openBalls(true);
    const beforeCaught = await select("great-ball", 20);
    const caught = await throwNow(true, true, beforeCaught);
    assert.equal(caught.lastCaptureResult.outcome, "caught");
    assert.equal(caught.lastCaptureResult.roll, 20);
    assert.equal(caught.bag.items["great-ball"], 0);
    assert.equal(caught.pokemons.length, 2);
    assert.equal(caught.pokemons[0].pokemon.level, 22);
    assert.equal(caught.pokemons[1].pokemon.level, 21);
    assert.equal(caught.pokemons[1].moves[0].currentPp, 17,
      "capture success does not make the wild Pokémon respond another time");
    assert.equal(caught.opponent, null);
    await waitArgs(playerA, () => !!document.querySelector('[data-testid="capture-throw-result"]')?.closest('[role="alertdialog"]'),
      "successful capture displays a blocking result alertdialog");
    await finish(20, ["flight", "shake", "result"]);
    assert.equal(await draws(), 1);
    await waitLocalItemFlush({ playerA, waitArgs });
    const finalParty = await state();
    await route();
    const afterReload = await state();
    assert.deepEqual(afterReload.lastCaptureResult, finalParty.lastCaptureResult);
    assert.deepEqual(afterReload.pokemons, finalParty.pokemons);
    assert.equal(afterReload.pokemons.filter((mon) => mon.captureId === caught.lastCaptureResult.captureId).length, 1);
    assert.equal(afterReload.bag.items["great-ball"], 0);
    assert.equal(afterReload.bag.items["poke-ball"], 0);
    console.log("PASS: a real mobile hit and favorable D20 animate into capture, preserve battle audio until Continue, add one Pokémon/reward once and never duplicate inventory or levels on reload.");
  } finally {
    await cdp.request("Emulation.setTouchEmulationEnabled", { enabled: false }, playerA).catch(() => {});
    await cdp.request("Emulation.clearDeviceMetricsOverride", {}, playerA).catch(() => {});
    await evalArgs(playerA, async () => {
      if (window.__qaCaptureRandom) crypto.getRandomValues = window.__qaCaptureRandom;
      const saved = window.__qaCaptureAudio;
      if (saved) {
        const { BattleMusic } = await import("/src/lib/battleMusic.ts");
        BattleMusic.prototype.unlock = saved.unlock;
        AudioBufferSourceNode.prototype.stop = saved.stop;
        AudioContext.prototype.close = saved.close;
      }
      window.__qaCaptureObserver?.disconnect();
    }).catch(() => {});
  }
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception during capture throwing");
}
