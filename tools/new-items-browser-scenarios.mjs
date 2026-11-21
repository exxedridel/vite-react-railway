import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { waitLocalItemFlush } from "./legacy-item-browser-fixture.mjs";

/** Isolated real UI/Nest flow for Max Revive and Rare Candy. */
export async function runNewItemsBrowserScenario({
  admin, playerA, cdp, evalArgs, waitArgs, field, clickButton,
  seedPvpTeam, shopRepository, shopService, shopGateway,
  pvpRepository,
}) {
  const origin = await evalArgs(playerA, () => location.origin);
  const state = () => evalArgs(playerA, async () => JSON.parse(JSON.stringify(
    (await import("/src/store/store.ts")).store.getState().party,
  )));
  const hp = (capture) => capture.pokemon.stats.find((stat) => stat.name === "hp").value;
  const until = async (check, label) => {
    const deadline = Date.now() + 25000;
    do {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    } while (Date.now() < deadline);
    throw new Error(`Timeout: ${label}`);
  };
  const route = async (page, path = "/dashboard") => {
    await cdp.request("Page.stopLoading", {}, page);
    await cdp.request("Page.navigate", { url: origin + path }, page);
    await waitArgs(page, async (path, player) => {
      const [storage, store] = await Promise.all([
        import("/src/store/accountStorage.ts"), import("/src/store/store.ts"),
      ]);
      const party = store.store.getState().party;
      return location.pathname === path &&
        !!document.querySelector(path === "/dashboard" ? 'a[href="/mensajes-prueba"]' : "main") &&
        storage.getActiveAccountId() !== null &&
        (!player || (party.bag?.walletUserId === 2 && party.pokemons.length >= 2));
    }, `new items route/account ready: ${path}`, path, page === playerA);
  };
  const noGate = async () => assert.equal(await evalArgs(playerA, () => !!document.querySelector(
    '[data-testid="item-use-lock"], [data-testid="shop-party-lock"], [data-testid="shop-reset-lock"], [data-testid="shop-gift-lock"]',
  )), false, "a locally applied new item must not cover the game while its batch waits");
  const fixture = async ({ battle = false, cap = false } = {}) => evalArgs(playerA, async (battle, cap) => {
    const [{ transactPvpParty }, storage, stats, fields, catalog] = await Promise.all([
      import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
      import("/src/lib/pokemonStats.ts"), import("/src/lib/battleField.ts"),
      import("/src/lib/trainerBattle/catalog.ts"),
    ]);
    await transactPvpParty(2, async (current) => {
      if (current.pvpLock || current.shopLock || current.resetLock || current.itemUseLock ||
        current.centerLock || current.captureAttempt || current.localItemOutbox?.operations.length)
        throw new Error("New-item fixture may not discard an operation or inventory intent");
      const party = JSON.parse(JSON.stringify(current));
      party.pokemons.forEach((capture, index) => {
        capture.pokemon = stats.changeLevel(capture.pokemon, cap && index === 0 ? 100 : 20);
        capture.pokemon.battleStages = stats.neutralBattleStages();
        capture.pokemon.battleStages.attack = index === 1 && !battle ? 1 : 0;
        capture.pokemon.stats.find((s) => s.name === "hp").value = index === 0
          ? (battle ? stats.getMaxHp(capture.pokemon) : 20) : 0;
        capture.moves = [{ ...catalog.trainerMoves.find((move) => move.id === 150),
          currentPp: index === 0 ? 19 : 7, source: "tm" }];
        capture.pokemon.learnset = { versionGroup: "emerald", moves: [{ id: 150, name: "splash" }] };
        capture.statuses = battle ? (index === 1 ? ["poisoned"] : []) : [index === 0 ? "burned" : "poisoned"];
        capture.statusTurns = {};
      });
      const first = party.pokemons[0];
      party.opponent = battle ? {
        kind: "wild", encounterId: "new-items-native-wild",
        pokemon: JSON.parse(JSON.stringify(first.pokemon)), stages: stats.neutralBattleStages(),
        moves: [{ ...catalog.trainerMoves.find((move) => move.id === 150), currentPp: 12, source: "wild" }],
        automation: { enabled: true, catalogRevision: 0 }, statuses: [], statusTurns: {},
      } : null;
      party.emerald = undefined; party.lastEmeraldBatch = undefined;
      party.lastBattleResult = null; party.lastMovesByPlayer = {}; party.lastOpponentMove = null;
      party.battleField = { ...fields.emptyBattleField(), activeCaptureId: first.captureId };
      party.pvpRevision = storage.pvpPartyRevision(current) + 1;
      return { party, value: undefined };
    });
  }, battle, cap);
  const openActions = async (index) => {
    await waitArgs(playerA, (index) => document.querySelectorAll('button[aria-label="Acciones de clefairy"]').length > index,
      "new item Party actions available", index);
    await evalArgs(playerA, (index) => document.querySelectorAll('button[aria-label="Acciones de clefairy"]')[index].click(), index);
    await waitArgs(playerA, () => !!document.querySelector('[data-testid="party-rare-candy"]'), "new Party item controls mounted");
  };
  const useParty = async (item) => {
    await waitArgs(playerA, (item) => {
      const button = document.querySelector(`[data-testid="party-${item}"]`);
      return button && !button.disabled;
    }, `Party ${item} can be used`, item);
    await evalArgs(playerA, (item) => {
      const button = document.querySelector(`[data-testid="party-${item}"]`);
      button.click(); button.click();
    }, item);
    await waitArgs(playerA, () => !document.querySelector('[role="dialog"]'), `${item} saved locally and closes Party actions`);
  };
  const selectShopPlayer = async () => {
    await waitArgs(admin, () => {
      const button = document.querySelector('[data-testid="shop-player-2"] button[aria-pressed]');
      return button && !button.disabled;
    }, "new item shopper is online, synchronized and free");
    await evalArgs(admin, () => document.querySelector('[data-testid="shop-player-2"] button[aria-pressed]').click());
  };
  const buy = async (name, itemId, quantity, expectedPrice) => {
    await selectShopPlayer();
    await waitArgs(admin, (name) => {
      const button = document.querySelector(`button[aria-label="Comprar ${name}"]`);
      return button && !button.disabled;
    }, `${name} is a purchasable catalog item`, name);
    await evalArgs(admin, (name) => document.querySelector(`button[aria-label="Comprar ${name}"]`).click(), name);
    await waitArgs(admin, () => !!document.querySelector('input[aria-label="Cantidad de objetos"]'), "new item quantity review");
    await field(admin, 'input[aria-label="Cantidad de objetos"]', String(quantity));
    await clickButton(admin, "Aceptar compra", '[role="dialog"]');
    await waitArgs(admin, () => [...document.querySelectorAll('[role="dialog"]')].some(
      (dialog) => dialog.textContent.includes("El jugador guardó") && [...dialog.querySelectorAll("button")].some(
        (button) => button.textContent.trim() === "Listo" && !button.disabled)), "new item purchase is durably saved by player");
    await clickButton(admin, "Listo", '[role="dialog"]');
    await waitArgs(admin, () => !document.querySelector('[role="dialog"]'), "purchase review finishes closing");
    const row = await shopRepository.get(2);
    const receipt = row.purchases.at(-1);
    assert.equal(receipt.itemId, itemId);
    assert.equal(receipt.quantity, quantity);
    assert.equal(receipt.unitPrice, expectedPrice);
    assert.equal(receipt.status, "applied");
    return row;
  };
  const gift = async (itemId) => {
    await waitArgs(admin, () => !document.querySelector('[role="dialog"]'), "previous new-item gift review is closed");
    await waitArgs(admin, () => {
      const player = document.querySelector('[data-testid="gift-player"]');
      const option = player?.querySelector('option[value="2"]');
      return player && !player.disabled && option && !option.disabled;
    }, "new-item gift player is ready");
    await field(admin, '[data-testid="gift-player"]', "2");
    await field(admin, '[data-testid="gift-item"]', itemId);
    await field(admin, '[data-testid="gift-quantity"]', "1");
    await waitArgs(admin, () => !document.querySelector('[data-testid="gift-open"]').disabled, "new-item gift is valid");
    await evalArgs(admin, () => document.querySelector('[data-testid="gift-open"]').click());
    await waitArgs(admin, () => !!document.querySelector('[data-testid="gift-confirm"]'), "new-item gift review");
    await evalArgs(admin, () => {
      const button = document.querySelector('[data-testid="gift-confirm"]'); button.click(); button.click();
    });
    await waitArgs(admin, () => [...document.querySelectorAll('[role="dialog"]')].some((dialog) =>
      dialog.textContent.includes("El jugador guardó el regalo.") && [...dialog.querySelectorAll("button")].some(
        (button) => button.textContent.trim() === "Listo" && !button.disabled)), "new-item gift applied once");
    await clickButton(admin, "Listo", '[role="dialog"]');
    await waitArgs(admin, () => !document.querySelector('[role="dialog"]'), "new-item gift review finishes closing");
  };
  const setPrice = async (name, itemId, amount) => {
    await waitArgs(admin, (name) => {
      const input = document.querySelector(`input[aria-label="Precio de ${name}"]`);
      return input && !input.disabled;
    }, "price field is editable after the preceding operation", name);
    await field(admin, `input[aria-label="Precio de ${name}"]`, String(amount));
    await waitArgs(admin, (name) => !document.querySelector(`button[aria-label="Guardar precio de ${name}"]`).disabled,
      "new-item edited price is valid", name);
    await evalArgs(admin, (name) => document.querySelector(`button[aria-label="Guardar precio de ${name}"]`).click(), name);
    await until(async () => (await shopService.catalog.snapshot()).prices[itemId] === amount, "new-item custom catalog price persisted");
  };
  await seedPvpTeam(playerA, 2, 100, 1.3);
  await fixture();
  const funded = await shopRepository.get(2), expectedStorage = funded.storageRevision;
  funded.balance = 3000; funded.revision++; funded.storageRevision++;
  assert.equal(await shopRepository.compareAndSwap(funded, expectedStorage), true);
  await shopGateway.publish();
  await waitArgs(playerA, async () => (await import("/src/store/store.ts")).store.getState().party.bag.money === 3000,
    "new-item shopper wallet synchronized");
  assert.equal((await shopService.catalog.snapshot()).prices["max-revive"], 300);
  assert.equal((await shopService.catalog.snapshot()).prices["rare-candy"], 300);
  await route(admin);
  await clickButton(admin, "Tienda");
  await buy("Max Revive", "max-revive", 2, 300);
  let row = await buy("Rare Candy", "rare-candy", 2, 300);
  assert.equal(row.balance, 1800);
  assert.equal(row.items["max-revive"], 2); assert.equal(row.items["rare-candy"], 2);
  await route(admin, "/back-office");
  await waitArgs(admin, () => !!document.querySelector('input[aria-label="Precio de Max Revive"]'), "new items appear in Back office pricing");
  assert.equal(await evalArgs(admin, () => document.querySelector('input[aria-label="Precio de Max Revive"]').value), "300");
  assert.equal(await evalArgs(admin, () => document.querySelector('input[aria-label="Precio de Rare Candy"]').value), "300");
  await gift("max-revive"); await gift("rare-candy");
  row = await shopRepository.get(2);
  assert.equal(row.balance, 1800);
  assert.equal(row.items["max-revive"], 3); assert.equal(row.items["rare-candy"], 3);
  await setPrice("Rare Candy", "rare-candy", 325);
  await setPrice("Max Revive", "max-revive", 0);
  await route(admin);
  await clickButton(admin, "Tienda");
  await buy("Rare Candy", "rare-candy", 1, 325);
  row = await buy("Max Revive", "max-revive", 1, 0);
  assert.equal(row.balance, 1475);
  assert.equal(row.items["max-revive"], 4); assert.equal(row.items["rare-candy"], 4);
  await route(admin, "/back-office");
  await waitArgs(admin, () => document.querySelector('input[aria-label="Precio de Rare Candy"]')?.value === "325" &&
    document.querySelector('input[aria-label="Precio de Max Revive"]')?.value === "0", "custom new-item prices survive reload");
  console.log("PASS: Max Revive/Rare Candy start at300, buy/gift through real admin UI, preserve money on gifts, and keep edited/free prices across reload without duplicate stock.");

  const beforeCandy = await state();
  const expectedLeveled = await evalArgs(playerA, async () => {
    const [stats, store] = await Promise.all([import("/src/lib/pokemonStats.ts"), import("/src/store/store.ts")]);
    return JSON.parse(JSON.stringify(stats.changeLevel(store.store.getState().party.pokemons[0].pokemon, 21)));
  });
  const originalBatch = shopService.consumeBatch;
  let releaseBatch, entered = false;
  const held = new Promise((resolve) => { releaseBatch = resolve; });
  shopService.consumeBatch = async function (actor, payload) {
    entered = true; await held;
    return originalBatch.call(this, actor, payload);
  };
  try {
    await openActions(0); await useParty("rare-candy");
    await until(() => entered, "new item background batch is held before commit");
    let party = await state();
    assert.deepEqual(party.pokemons[0].pokemon, expectedLeveled);
    assert.deepEqual(party.pokemons[0].moves, beforeCandy.pokemons[0].moves);
    assert.deepEqual(party.pokemons[0].statuses, beforeCandy.pokemons[0].statuses);
    assert.equal(party.bag.items["rare-candy"], 3);
    assert.equal((await shopRepository.get(2)).items["rare-candy"], 4);
    await noGate();
    await openActions(1); await useParty("max-revive");
    party = await state();
    const maxHp = await evalArgs(playerA, async () => {
      const [stats, store] = await Promise.all([import("/src/lib/pokemonStats.ts"), import("/src/store/store.ts")]);
      return stats.getMaxHp(store.store.getState().party.pokemons[1].pokemon);
    });
    assert.equal(hp(party.pokemons[1]), maxHp);
    assert.deepEqual(party.pokemons[1].moves, beforeCandy.pokemons[1].moves);
    assert.deepEqual(party.pokemons[1].statuses, beforeCandy.pokemons[1].statuses);
    assert.deepEqual(party.pokemons[1].pokemon.battleStages, beforeCandy.pokemons[1].pokemon.battleStages);
    assert.equal(party.bag.items["max-revive"], 3);
    assert.equal((await shopRepository.get(2)).items["max-revive"], 4);
    assert.equal(party.localItemOutbox.operations.length, 2);
    await noGate();
  } finally {
    releaseBatch(); shopService.consumeBatch = originalBatch;
  }
  await waitLocalItemFlush({ playerA, waitArgs });
  const afterPartyItems = await state();
  assert.equal((await shopRepository.get(2)).items["rare-candy"], 3);
  assert.equal((await shopRepository.get(2)).items["max-revive"], 3);
  await openActions(1);
  assert.equal(await evalArgs(playerA, () => document.querySelector('[data-testid="party-max-revive"]').disabled), true,
    "Max Revive is unavailable for an already living Pokémon");
  await route(playerA);
  assert.deepEqual((await state()).pokemons, afterPartyItems.pokemons);
  console.log("PASS: outside battle Rare Candy raises one level with proportional HP/status/PP, Max Revive restores only a fainted target's HP, and both effects/debits persist before network acknowledgement with no global gate or double click replay.");

  await fixture({ cap: true });
  await openActions(0);
  assert.equal(await evalArgs(playerA, () => document.querySelector('[data-testid="party-rare-candy"]').disabled), true,
    "level100 cannot waste a Rare Candy");
  await evalArgs(playerA, () => document.querySelector('[data-testid="party-rare-candy"]').click());
  assert.equal((await state()).bag.items["rare-candy"], 3);
  await route(playerA);
  await fixture({ battle: true });
  await openActions(0);
  assert.equal(await evalArgs(playerA, () => document.querySelector('[data-testid="party-rare-candy"]').disabled), true,
    "Rare Candy is unavailable during a local encounter");
  await route(playerA);
  console.log("PASS: Rare Candy stays unavailable at level100 and during a local battle without consuming stock.");

  const beforeWild = await state(), benchId = beforeWild.pokemons[1].captureId;
  await waitArgs(playerA, () => !!document.querySelector('button[aria-label="Abrir combate de clefairy"]'), "new-item wild battle ready");
  await evalArgs(playerA, () => document.querySelector('button[aria-label="Abrir combate de clefairy"]').click());
  await waitArgs(playerA, () => !!document.querySelector('[data-testid="battle-max-revive"]'), "wild Max Revive UI mounted");
  await evalArgs(playerA, () => { document.querySelector('[data-testid="battle-items"]').open = true; });
  await field(playerA, '[data-testid="battle-max-revive-target"]', benchId);
  await waitArgs(playerA, () => !document.querySelector('[data-testid="battle-max-revive"]').disabled, "wild fainted bench can be revived");
  await evalArgs(playerA, () => {
    const b = document.querySelector('[data-testid="battle-max-revive"]'); b.click(); b.click();
  });
  await waitArgs(playerA, () => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Volver al combate"), "revive consumes and resolves the native turn");
  await clickButton(playerA, "Volver al combate", '[role="dialog"]');
  let wild = await state();
  assert.equal(wild.bag.items["max-revive"], 2);
  assert.equal(wild.battleField.turn, 2);
  assert.equal(wild.pokemons[0].moves[0].currentPp, 19);
  assert.equal(wild.pokemons[1].moves[0].currentPp, 7);
  assert.deepEqual(wild.pokemons[1].statuses, ["poisoned"], "Max Revive must not act as Full Restore on an imported fainted target");
  assert.equal(wild.opponent.moves[0].currentPp, 11);
  assert(hp(wild.pokemons[1]) > 0);
  const nativeRevived = await evalArgs(playerA, async (captureId) => {
    const [native, store] = await Promise.all([import("/src/lib/emerald/engine.ts"), import("/src/store/store.ts")]);
    const battle = native.restoreEmeraldBattle(store.store.getState().party.emerald.engine);
    const mon = battle.p1.pokemon.find((entry) => entry.set.name === captureId);
    return { hp: mon.hp, maxhp: mon.maxhp, fainted: mon.fainted, left: battle.p1.pokemonLeft, status: mon.status };
  }, benchId);
  assert.equal(nativeRevived.hp, nativeRevived.maxhp);
  assert.equal(nativeRevived.fainted, false); assert.equal(nativeRevived.left, 2);
  assert.equal(nativeRevived.status, "psn");
  await evalArgs(playerA, async (captureId) => {
    const [store, commands] = await Promise.all([import("/src/store/store.ts"), import("/src/lib/emerald/commands.ts")]);
    const activeId = store.store.getState().party.battleField.activeCaptureId;
    await store.store.dispatch(commands.submitEmeraldAction(activeId, "player", { kind: "switch", captureId }));
  }, benchId);
  wild = await state();
  assert.equal(wild.battleField.activeCaptureId, benchId, "the native engine can actually switch to the revived Pokémon");
  assert.equal(wild.opponent.moves[0].currentPp, 10);
  await waitLocalItemFlush({ playerA, waitArgs });
  await route(playerA);
  assert.equal((await state()).bag.items["max-revive"], 2);
  assert.equal((await state()).battleField.activeCaptureId, benchId);
  console.log("PASS: wild Max Revive consumes exactly one item/action, restores native fainted/party counts and full HP, preserves both own PP sets, runs one NPC response and permits switching to the revived teammate after reload.");

  await fixture({ battle: false });
  await evalArgs(playerA, async () => {
    const [store, stats] = await Promise.all([import("/src/store/store.ts"), import("/src/lib/pokemonStats.ts")]);
    await store.transactPvpParty(2, async (current) => {
      const party = JSON.parse(JSON.stringify(current));
      const lead = party.pokemons[0];
      lead.pokemon.stats.find((stat) => stat.name === "hp").value = stats.getMaxHp(lead.pokemon);
      for (const [index, capture] of party.pokemons.entries()) {
        capture.statuses = index === 1 ? ["poisoned"] : []; capture.statusTurns = {};
        capture.pokemon.battleStages = stats.neutralBattleStages();
      }
      party.pvpRevision++;
      return { party, value: undefined };
    });
  });
  const beforeAdmin = await state();
  await route(admin);
  await clickButton(admin, "Panel batalla"); await clickButton(admin, "Trainer Battle");
  await waitArgs(admin, () => !!document.querySelector('select[aria-label="Jugador Trainer A"] option[value="2"]'), "new-item admin trainer player online");
  await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
  await clickButton(admin, "Solicitar equipo y preparar Trainer");
  await waitArgs(admin, () => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Iniciar Trainer Battle" && !b.disabled), "new-item Trainer snapshot ready");
  const battleId = (await pvpRepository.locked())[0].battleId;
  await clickButton(admin, "Iniciar Trainer Battle");
  await waitArgs(admin, () => !!document.querySelector('[data-testid="trainer-max-revive-a"]'), "admin Max Revive UI available");
  await evalArgs(admin, () => { document.querySelector('[data-testid="trainer-items-a"]').open = true; });
  await field(admin, '[data-testid="trainer-max-revive-target-a"]', beforeAdmin.pokemons[1].captureId);
  await waitArgs(admin, () => !document.querySelector('[data-testid="trainer-max-revive-a"]').disabled, "admin may spend the player's reserved Max Revive");
  await evalArgs(admin, () => document.querySelector('[data-testid="trainer-max-revive-a"]').click());
  await until(async () => (await pvpRepository.get(battleId)).session.teams.a.pokemons[1].pokemon.stats.find((s) => s.name === "hp").value > 0,
    "admin revive effect is checkpointed before continuing");
  let adminBattle = await pvpRepository.get(battleId);
  assert.equal((await shopRepository.get(2)).items["max-revive"], 1);
  assert.equal(adminBattle.session.teams.a.pokemons[1].moves[0].currentPp, 7);
  assert.deepEqual(adminBattle.session.teams.a.pokemons[1].statuses, ["poisoned"]);
  assert.equal(adminBattle.session.teams.a.pokemons[0].moves[0].currentPp, 19);
  await waitArgs(admin, () => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Volver al combate"), "admin item turn summary");
  await clickButton(admin, "Volver al combate", '[role="dialog"]');
  const teamName = adminBattle.session.teams.a.name;
  await clickButton(admin, `Rendirse: ${teamName}`);
  await clickButton(admin, "Confirmar rendición", '[role="dialog"]');
  await until(async () => (await pvpRepository.get(battleId)).phase === "finished", "admin item battle forfeit is durably finished");
  await waitArgs(admin, () => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Volver al combate"), "admin forfeit summary is ready");
  await clickButton(admin, "Volver al combate", '[role="dialog"]');
  await clickButton(admin, "Salir y actualizar Party");
  await waitArgs(playerA, async (battleId) => {
    const party = (await import("/src/store/store.ts")).store.getState().party;
    return !party.pvpLock && party.pvpReceipts?.some((receipt) => receipt.battleId === battleId) &&
      party.bag.items["max-revive"] === 1 && party.pokemons[1].pokemon.stats.find((stat) => stat.name === "hp").value > 0;
  }, "admin revived Party result and central debit apply once before unlock", battleId);
  const afterAdmin = await state();
  await route(playerA);
  assert.equal((await state()).bag.items["max-revive"], 1);
  assert.deepEqual((await state()).pokemons, afterAdmin.pokemons);
  assert.equal((await shopRepository.get(2)).items["rare-candy"], 3);
  await cdp.request("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }, playerA);
  try {
    await openActions(0);
    await evalArgs(playerA, async () => {
      const dialog = document.querySelector('[role="dialog"]');
      await Promise.all(dialog.getAnimations({ subtree: true })
        .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})));
    });
    assert.equal(await evalArgs(playerA, () => {
      const dialog = document.querySelector('[role="dialog"]');
      return dialog.scrollWidth <= dialog.clientWidth && document.documentElement.scrollWidth <= innerWidth;
    }), true, "new Party item controls remain within the mobile viewport and scroll vertically");
    for (const part of ["top", "bottom"]) {
      await evalArgs(playerA, async (part) => {
        const dialog = document.querySelector('[role="dialog"]');
        dialog.scrollTop = part === "top" ? 0 : dialog.scrollHeight;
        await new Promise(requestAnimationFrame);
      }, part);
      const shot = await cdp.request("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, playerA);
      await writeFile(join(tmpdir(), `pokemon-new-items-party-mobile-${part}.png`), Buffer.from(shot.data, "base64"));
    }
  } finally {
    await cdp.request("Emulation.clearDeviceMetricsOverride", {}, playerA);
  }
  assert.deepEqual(cdp.exceptions, [], "new item browser flow must produce no unexpected exceptions");
  console.log("PASS: administrator Trainer Battle authorizes and spends one reserved Max Revive, saves the revived Pokémon's HP/PP, and releases one durable result without a duplicate item after reload.");
}
