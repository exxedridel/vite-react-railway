import assert from "node:assert/strict";

/** Isolated Chrome/native-engine/central-wallet regression for trainer losses. */
export async function runTrainerPenaltiesBrowserScenario({
  admin, playerA, cdp, evalArgs, waitArgs, field, clickButton,
  seedPvpTeam, partyState, frontendUrl, backendUrl, shopRepository,
  shopService, shopGateway, pvpRepository, pvpGateway,
}) {
  const state = () => partyState(playerA);
  const until = async (predicate, label) => {
    const deadline = Date.now() + 20000;
    do {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    throw new Error(`Timeout: ${label}`);
  };
  const route = async (page, path = "/dashboard") => {
    await cdp.request("Page.stopLoading", {}, page);
    await cdp.request("Page.navigate", { url: frontendUrl + path }, page);
    await waitArgs(page, async (path) =>
      location.pathname === path &&
      !!document.querySelector('a[href="/mensajes-prueba"]') &&
      (await import("/src/store/accountStorage.ts")).getActiveAccountId() !== null,
    `penalty ${path} and account loaded`, path);
  };
  const hydrated = async () => waitArgs(playerA, async () =>
    (await import("/src/store/store.ts")).store.getState().party.pokemons.length === 1,
  "penalty Party fixture has rehydrated");
  const flush = async () => waitArgs(playerA, async () =>
    !(await import("/src/store/store.ts")).store.getState().party.localRewardOutbox?.length,
  "trainer penalty receives a terminal central receipt");
  const money = async (amount) => waitArgs(playerA, async (amount) =>
    (await import("/src/store/store.ts")).store.getState().party.bag.money === amount,
  `penalty wallet reaches ${amount} without manual refresh`, amount);
  const noGate = async () => assert.equal(await evalArgs(playerA, () =>
    !!document.querySelector('[data-testid="pvp-party-lock"], [data-testid="item-use-lock"], [data-testid="shop-party-lock"]')),
  false, "local penalty synchronization never covers the player's arena");
  const fixture = async (name, kind, color, optIn = true) => {
    await evalArgs(playerA, async (name, kind, color, optIn) => {
      const [{ store, transactPvpParty }, storage, fields, catalog, stats, encounter] = await Promise.all([
        import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
        import("/src/lib/battleField.ts"), import("/src/lib/trainerBattle/catalog.ts"),
        import("/src/lib/pokemonStats.ts"), import("/src/lib/localEncounter.ts"),
      ]);
      await transactPvpParty(2, async (current) => {
        if (current.pvpLock || current.shopLock || current.itemUseLock || current.resetLock || current.centerLock || current.captureAttempt)
          throw new Error("Penalty fixture cannot replace a reserved operation");
        const party = JSON.parse(JSON.stringify(current));
        const own = party.pokemons[0];
        own.statuses = []; own.statusTurns = {};
        own.pokemon.battleStages = stats.neutralBattleStages();
        own.moves = [{ ...catalog.trainerMoves.find((move) => move.id === 150), source: "tm", currentPp: 40 }];
        own.pokemon.learnset = { versionGroup: "emerald", moves: [{ id: 150, name: "splash" }] };
        own.pokemon.stats.forEach((stat) => { stat.value = stat.name === "speed" ? 500 : 1; });
        party.opponent = null; party.emerald = undefined; party.lastEmeraldBatch = undefined;
        party.lastMovesByPlayer = {}; party.lastOpponentMove = null;
        party.battleField = { ...fields.emptyBattleField(), activeCaptureId: own.captureId };
        party.starterClaimed = true;
        party.pvpRevision = storage.pvpPartyRevision(current) + 1;
        return { party, value: undefined };
      });
      const party = store.getState().party;
      const species = catalog.trainerSpecies.find((pokemon) => pokemon.id === 35);
      const pokemon = stats.createLeveledPokemon({
        id: species.id, name: species.name, image: null, types: species.types,
        stats: species.baseStats,
        learnset: { versionGroup: "emerald", moves: [{ id: 129, name: "swift" }] },
      }, undefined, 20);
      pokemon.stats.forEach((stat) => { if (stat.name !== "hp") stat.value = stat.name === "speed" ? 1 : 500; });
      await store.dispatch(encounter.prepareLocalEncounter({
        kind, encounterId: name, pokemon, stages: {}, statuses: [], statusTurns: {},
        automation: { enabled: true, catalogRevision: 0 },
        rewards: { version: 1, color, epoch: party.bag.rewardEpoch ?? 0, ...(optIn ? { lossPenaltyVersion: 1 } : {}) },
        moves: [{ ...catalog.trainerMoves.find((move) => move.id === 129), source: "wild", currentPp: 20 }],
      }));
    }, name, kind, color, optIn);
  };
  const openBattle = async () => {
    await route(playerA);
    await hydrated();
    await waitArgs(playerA, () => !!document.querySelector('button[aria-label="Abrir combate de clefairy"]'),
      "penalty battle trigger ready");
    await evalArgs(playerA, () => document.querySelector('button[aria-label="Abrir combate de clefairy"]').click());
    await waitArgs(playerA, () => !!document.querySelector(".battle-scene"), "penalty native arena mounted");
  };
  const lose = async () => {
    await openBattle();
    const before = await state();
    await evalArgs(playerA, async () => {
      const [{ store }, commands] = await Promise.all([
        import("/src/store/store.ts"), import("/src/lib/emerald/commands.ts"),
      ]);
      await store.dispatch(commands.submitEmeraldAction(store.getState().party.pokemons[0].captureId,
        "player", { kind: "move", moveId: 150 }));
    });
    await waitArgs(playerA, async () => {
      const party = (await import("/src/store/store.ts")).store.getState().party;
      return party.emerald?.ended && party.pokemons.every((mon) => mon.pokemon.stats.find((stat) => stat.name === "hp").value === 0);
    }, "native trainer defeats the entire real Party");
    await noGate();
    const after = await state();
    assert.equal(after.pokemons[0].moves[0].currentPp, before.pokemons[0].moves[0].currentPp - 1,
      "losing preserves the PP spent in the player's action");
    assert.equal(after.pokemons[0].pokemon.level, before.pokemons[0].pokemon.level);
    assert.deepEqual(after.bag.items, before.bag.items);
    assert.deepEqual(after.bag.badges, before.bag.badges);
    return after;
  };
  const originalClaim = shopService.rewardClaim;
  const claims = [];
  shopService.rewardClaim = async function (actor, payload) {
    claims.push({ actor, payload: structuredClone(payload) });
    return originalClaim.call(this, actor, payload);
  };
  try {
    await route(playerA);
    await seedPvpTeam(playerA, 1, 1, 1.3);
    const initial = await shopRepository.get(2);
    const initialRevision = initial.storageRevision;
    initial.items["max-ether"] = 2;
    initial.items.tm = 3;
    initial.revision++; initial.storageRevision++;
    assert.equal(await shopRepository.compareAndSwap(initial, initialRevision), true);
    await shopGateway.publish();
    await waitArgs(playerA, async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag.items.tm === 3,
    "central inventory fixture synchronized before defeat");
    const startingBalance = (await shopRepository.get(2)).balance;

    await fixture("penalty-local-green", "trainer", "green");
    const first = await lose();
    await flush(); await money(startingBalance - 100);
    const greenLedger = await shopRepository.get(2);
    const greenReceipt = greenLedger.rewards.find((receipt) => receipt.encounterId === "penalty-local-green");
    assert.equal(greenReceipt.status, "debited");
    assert.equal(greenReceipt.penaltyVersion, 1);
    assert.equal(greenReceipt.amount, 100);
    assert.equal(greenReceipt.nominalAmount, 100);
    const greenClaim = claims.find((entry) => entry.payload.rewards.some((reward) => reward.encounterId === "penalty-local-green"));
    assert(greenClaim);
    await originalClaim.call(shopService, greenClaim.actor, greenClaim.payload);
    await originalClaim.call(shopService, greenClaim.actor, { rewards: greenClaim.payload.rewards.map(({ penaltyVersion, ...reward }) => reward) });
    assert.equal((await shopRepository.get(2)).balance, startingBalance - 100,
      "replaying either result cannot produce a second financial settlement");
    assert.equal((await shopRepository.get(2)).revision, greenLedger.revision);
    await route(playerA); await hydrated();
    assert.deepEqual((await state()).pokemons, first.pokemons);
    assert.equal((await state()).localRewardOutbox.length, 0);
    console.log("PASS: automatic green trainer loss deducts 100 PD, preserves PP/items/levels and settles once across reload, replay and an opposite outcome claim.");

    await cdp.request("Network.enable", {}, playerA);
    await cdp.request("Network.setBlockedURLs", { urls: [`${backendUrl}/socket.io/*`] }, playerA);
    await route(playerA); await hydrated();
    await fixture("penalty-offline-red", "trainer", "red");
    const offline = await lose();
    assert.equal(offline.localRewardOutbox.length, 1);
    assert.equal(offline.localRewardOutbox[0].penaltyVersion, 1);
    assert.equal((await shopRepository.get(2)).balance, startingBalance - 100);
    await route(playerA); await hydrated();
    assert.deepEqual((await state()).localRewardOutbox, offline.localRewardOutbox);
    await noGate();
    await cdp.request("Network.setBlockedURLs", { urls: [] }, playerA);
    await route(playerA); await hydrated();
    await flush(); await money(Math.max(0, startingBalance - 500));
    assert.equal((await shopRepository.get(2)).rewards.filter((receipt) => receipt.encounterId === "penalty-offline-red").length, 1);
    console.log("PASS: offline red trainer loss persists its penalty without a gate and synchronizes exactly once after reconnect.");

    const beforeExempt = await shopRepository.get(2);
    await fixture("penalty-local-pink-zero", "trainer", "pink");
    await lose(); await flush();
    const pinkReceipt = (await shopRepository.get(2)).rewards.find((receipt) => receipt.encounterId === "penalty-local-pink-zero");
    assert.equal(pinkReceipt.status, "debited");
    assert.equal(pinkReceipt.amount, 0);
    assert.equal(pinkReceipt.nominalAmount, 0);
    await fixture("penalty-wild-exempt", "wild", "red");
    await lose(); await flush();
    await fixture("penalty-legacy-exempt", "trainer", "red", false);
    await lose(); await flush();
    const afterExempt = await shopRepository.get(2);
    assert.equal(afterExempt.balance, beforeExempt.balance);
    assert.equal(afterExempt.rewards.some((receipt) => receipt.encounterId === "penalty-wild-exempt"), false);
    assert.equal(afterExempt.rewards.some((receipt) => receipt.encounterId === "penalty-legacy-exempt"), false);
    console.log("PASS: pink defeat records a terminal zero charge; wild and pre-feature saved trainer encounters remain exempt.");

    await fixture("penalty-local-forfeit-blue", "trainer", "blue");
    await openBattle();
    const beforeForfeit = await state();
    await clickButton(playerA, "Oponente", '[role="dialog"]');
    await clickButton(playerA, "Rendirse", '[role="dialog"]');
    await waitArgs(playerA, () => document.body.innerText.includes("Rendirse descontará hasta 200 Pokedollars"),
      "local forfeit confirms the frozen blue tariff before charging");
    await clickButton(playerA, "Cancelar", '[role="dialog"]');
    assert.equal((await shopRepository.get(2)).rewards.some((receipt) => receipt.encounterId === "penalty-local-forfeit-blue"), false);
    await clickButton(playerA, "Rendirse", '[role="dialog"]');
    await clickButton(playerA, "Rendirse", '[role="dialog"]');
    await waitArgs(playerA, async () => !(await import("/src/store/store.ts")).store.getState().party.opponent,
      "confirmed local surrender removes the trainer in a checked Party write");
    await flush();
    const forfeitReceipt = (await shopRepository.get(2)).rewards.find((receipt) => receipt.encounterId === "penalty-local-forfeit-blue");
    assert.equal(forfeitReceipt.status, "debited");
    assert.equal(forfeitReceipt.nominalAmount, 200);
    assert.equal(forfeitReceipt.amount, 0, "a penniless player can surrender without debt");
    assert.deepEqual((await state()).pokemons, beforeForfeit.pokemons);
    console.log("PASS: local trainer surrender warns of the blue tariff, cancellation is free, and confirmation records one zero-floor penalty without spending PP or changing levels.");

    // Give the isolated wallet less than Brock's tariff and revive its real Party.
    const partial = await shopRepository.get(2), previousStorageRevision = partial.storageRevision;
    partial.balance = 25; partial.revision++; partial.storageRevision++;
    assert.equal(await shopRepository.compareAndSwap(partial, previousStorageRevision), true);
    await shopGateway.publish(); await money(25);
    await evalArgs(playerA, async () => {
      const [{ transactPvpParty }, stats] = await Promise.all([
        import("/src/store/store.ts"), import("/src/lib/pokemonStats.ts"),
      ]);
      await transactPvpParty(2, async (party) => {
        const pokemons = JSON.parse(JSON.stringify(party.pokemons));
        for (const mon of pokemons) {
          mon.pokemon.stats.find((stat) => stat.name === "hp").value = stats.getMaxHp(mon.pokemon);
          mon.statuses = []; mon.statusTurns = {};
        }
        return { party: { ...party, pokemons, opponent: null, emerald: undefined,
          pvpRevision: party.pvpRevision + 1 }, value: undefined };
      });
    });
    await route(playerA); await hydrated();
    const adminBefore = await state();
    const walletBefore = await shopRepository.get(2);
    await route(admin);
    await clickButton(admin, "Panel batalla");
    await clickButton(admin, "Trainer Battle");
    await waitArgs(admin, () => !!document.querySelector('select[aria-label="Jugador Trainer A"] option[value="2"]'),
      "penalty Trainer Battle lists the real online player");
    await field(admin, 'select[aria-label="Categoría Trainer"]', "gym");
    await field(admin, 'select[aria-label="Preset Trainer"]', "kanto-brock");
    await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
    await clickButton(admin, "Solicitar equipo y preparar Trainer");
    await waitArgs(admin, () => [...document.querySelectorAll("button")].some((button) =>
      button.textContent.trim() === "Iniciar Trainer Battle" && !button.disabled), "penalty Trainer snapshot ready");
    const battleId = (await pvpRepository.locked())[0].battleId;
    assert.equal((await pvpRepository.get(battleId)).lossPenaltyVersion, 1);
    await clickButton(admin, "Iniciar Trainer Battle");
    await waitArgs(admin, () => [...document.querySelectorAll('section[aria-label^="Controles de"] button')].some((button) =>
      button.textContent.trim().startsWith("Rendirse:") && !button.disabled), "admin can forfeit the human Trainer turn");
    await evalArgs(admin, () => {
      const section = document.querySelector('section[aria-label^="Controles de"]');
      [...section.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith("Rendirse:")).click();
    });
    await clickButton(admin, "Confirmar rendición", '[role="dialog"]');
    await until(async () => (await pvpRepository.get(battleId)).phase === "finished", "Trainer forfeit durably finishes");
    assert.equal((await shopRepository.get(2)).balance, 25, "admin penalty waits until the final result is saved and exited");
    await waitArgs(admin, () => [...document.querySelectorAll("button")].some((button) =>
      button.textContent.trim() === "Volver al combate"), "admin forfeit summary ready");
    await clickButton(admin, "Volver al combate", '[role="dialog"]');
    await clickButton(admin, "Salir y actualizar Party");
    await waitArgs(playerA, async (battleId) => {
      const party = (await import("/src/store/store.ts")).store.getState().party;
      return !party.pvpLock && party.pvpReceipts?.some((receipt) => receipt.battleId === battleId);
    }, "forfeit penalty and results settle before releasing the player's reservation", battleId);
    await money(0);
    const finalWallet = await shopRepository.get(2);
    const penalty = finalWallet.rewards.find((receipt) => receipt.rewardId === `admin:${battleId}`);
    assert.equal(penalty.status, "debited");
    assert.equal(penalty.nominalAmount, 50);
    assert.equal(penalty.amount, 25);
    assert.equal(penalty.rewardBundleVersion, undefined);
    assert.equal(penalty.items, undefined);
    assert.equal(penalty.badgeId, undefined);
    assert.deepEqual(finalWallet.items, walletBefore.items);
    assert.deepEqual(finalWallet.badges, walletBefore.badges);
    assert.deepEqual((await state()).pokemons, adminBefore.pokemons,
      "forfeiting does not invent a KO, consume PP or change Pokemon progression");
    await pvpGateway.publish(); await shopGateway.publish();
    await route(playerA); await hydrated(); await money(0);
    assert.equal((await shopRepository.get(2)).rewards.filter((receipt) => receipt.rewardId === `admin:${battleId}`).length, 1);
    assert.equal((await shopRepository.get(2)).revision, finalWallet.revision);
    console.log("PASS: admin Trainer forfeit charges only the available 25 of Brock's 50 PD, grants no gym bundle, releases Party and never charges again after reload/publish.");
  } finally {
    shopService.rewardClaim = originalClaim;
    await cdp.request("Network.setBlockedURLs", { urls: [] }, playerA).catch(() => {});
  }
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception during trainer penalties");
}
