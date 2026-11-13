import assert from "node:assert/strict";
import { fullRestoreBrowserScenario } from "./full-restore-browser-scenarios.mjs";
import { ppItemsBrowserScenario } from "./pp-items-browser-scenarios.mjs";
import { tmBrowserScenario } from "./tm-browser-scenarios.mjs";

/** Real UI scenarios, using the identity/Nest/Chrome harness in test-pvp-browser. */
export async function runShopBrowserScenario({
  admin,
  playerA,
  playerB,
  cdp,
  evalArgs,
  waitArgs,
  field,
  clickButton,
  partyState,
  seedPvpTeam,
  frontendUrl,
  shopRepository,
  shopService,
  shopGateway,
  pvpRepository,
  pvpService,
  pvpGateway,
}) {
  const balance = (id) => `[data-testid="shop-balance-${id}"]`;
  const card = (id) => `[data-testid="shop-player-${id}"]`;
  const waitBalance = (id, amount) =>
    waitArgs(
      admin,
      (selector, value) =>
        document.querySelector(selector)?.textContent.replace(/[^0-9]/g, "") ===
        String(value),
      `live shop balance ${id}=${amount}`,
      balance(id),
      amount,
    );
  const closeDialog = async (text = "Cancelar") => {
    await clickButton(admin, text, "[role=dialog]");
    await waitArgs(
      admin,
      () => !document.querySelector('[role="dialog"]'),
      "purchase dialog closes",
    );
  };
  const select = async (id) => {
    await waitArgs(
      admin,
      (selector) => {
        const button = document
          .querySelector(selector)
          ?.querySelector("button[aria-pressed]");
        return button && !button.disabled;
      },
      `player ${id} has synchronized and is available for shopping`,
      card(id),
    );
    return evalArgs(
      admin,
      (selector) => {
        const button = document
          .querySelector(selector)
          ?.querySelector("button[aria-pressed]");
        if (!button || button.disabled)
          throw new Error("Player cannot be selected for shopping");
        button.click();
      },
      card(id),
    );
  };
  const openItem = async (name) => {
    await waitArgs(
      admin,
      (label) => {
        const button = document.querySelector(`button[aria-label="${label}"]`);
        return button && !button.disabled;
      },
      `item ${name} is available for the selected player`,
      `Comprar ${name}`,
    );
    await evalArgs(
      admin,
      (label) => {
        const button = document.querySelector(`button[aria-label="${label}"]`);
        if (!button || button.disabled)
          throw new Error("The selected item is unavailable");
        button.click();
      },
      `Comprar ${name}`,
    );
    await waitArgs(
      admin,
      () =>
        !!document.querySelector(
          '[role="dialog"] input[aria-label="Cantidad de objetos"]',
        ),
      "purchase quantity dialog",
    );
  };
  const acceptEnabled = () =>
    [...document.querySelectorAll('[role="dialog"] button')].some(
      (button) =>
        button.textContent.trim() === "Aceptar compra" && !button.disabled,
    );
  const openReset = async () => {
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="player-menu"]'),
      "player menu is available for a new game",
    );
    await evalArgs(playerA, () => {
      const trigger = document.querySelector('[data-testid="player-menu"]');
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="restart-game"]'),
      "restart action is visible in the player menu",
    );
    await evalArgs(playerA, () =>
      document.querySelector('[data-testid="restart-game"]').click(),
    );
    await waitArgs(
      playerA,
      () =>
        !!document.querySelector('[data-testid="confirm-restart-game"]') &&
        document
          .querySelector('[role="dialog"]')
          ?.textContent.includes("500 Pokedollars"),
      "reset confirmation explains the starting Pokedollars",
    );
  };
  const confirmResetTwice = async () =>
    evalArgs(playerA, () => {
      const button = document.querySelector(
        '[data-testid="confirm-restart-game"]',
      );
      if (!button || button.disabled)
        throw new Error("The connected player cannot confirm a new game");
      button.click();
      button.click();
    });
  const waitResetSaved = async (label) =>
    waitArgs(
      playerA,
      async () => {
        const [{ store }, storage] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
        ]);
        const party = store.getState().party;
        return (
          storage.getActiveAccountId() === 2 &&
          party.bag.walletUserId === 2 &&
          !storage.isLocalPartyMutationBlocked(party) &&
          !party.resetLock &&
          !party.shopLock &&
          party.pokemons.length === 0 &&
          party.bag.money === 500 &&
          Object.values(party.bag.items ?? {}).every((count) => count === 0)
        );
      },
      label,
    );

  await clickButton(admin, "Tienda");
  await waitBalance(2, 500);
  await waitBalance(3, 500);
  await waitArgs(
    admin,
    () =>
      document.body.innerText.includes("Poké Mart") &&
      !document.body.innerText.includes("Abrir tienda"),
    "Poké Mart opens directly without setup",
  );
  for (const [page, id] of [
    [playerA, 2],
    [playerB, 3],
  ]) {
    await waitArgs(
      page,
      async () => {
        const { store } = await import("/src/store/store.ts");
        const bag = store.getState().party.bag;
        return (
          bag.money === 500 &&
          bag.walletUserId !== undefined &&
          bag.currencyVersion === 1
        );
      },
      "initial 500 Pokedollars is saved on the player",
    );
    const original = await partyState(page);
    await evalArgs(page, async () => {
      const [{ store }, actions] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/slices/partySlice.ts"),
      ]);
      const before = store.getState().party.bag.money;
      store.dispatch(
        actions.changeBagMoney({ amount: 999999, direction: "add" }),
      );
      if (store.getState().party.bag.money !== before)
        throw new Error("A player could edit Pokedollars directly");
    });
    assert.equal((await partyState(page)).bag.money, original.bag.money);
    assert.equal((await shopRepository.get(id)).balance, 500);
  }
  await seedPvpTeam(playerA, 1, 40, 1.3);
  await seedPvpTeam(playerB, 1, 40, 1.3);
  await waitArgs(
    admin,
    (selector) =>
      !document.querySelector(selector)?.textContent.includes("Sincronizando"),
    "player A shopping readiness",
    card(2),
  );

  // The 600 balance is a server fixture, never a client-facing credit endpoint.
  const sixHundred = await shopRepository.get(3);
  const oldStorageRevision = sixHundred.storageRevision;
  sixHundred.balance = 600;
  sixHundred.revision++;
  sixHundred.storageRevision++;
  assert.equal(
    await shopRepository.compareAndSwap(sixHundred, oldStorageRevision),
    true,
  );
  await shopGateway.publish();
  await waitBalance(3, 600);
  await waitArgs(
    playerB,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag.money ===
      600,
    "server wallet mirrors on player B",
  );
  await field(admin, `${card(3)} select`, "purple");
  await select(3);
  await openItem("Great Ball");
  assert.equal(
    await evalArgs(
      admin,
      () => document.querySelector('[aria-label="Cantidad de objetos"]').max,
    ),
    "2",
  );
  await field(admin, '[aria-label="Cantidad de objetos"]', "3");
  assert.equal(
    await evalArgs(admin, acceptEnabled),
    false,
    "cannot confirm over the affordable maximum",
  );
  await field(admin, '[aria-label="Cantidad de objetos"]', "2");
  await waitArgs(admin, acceptEnabled, "two Great Balls are affordable at 600");
  await closeDialog();
  assert.equal((await shopRepository.get(3)).balance, 600);
  assert.equal((await partyState(playerB)).bag.items?.["great-ball"] ?? 0, 0);

  await openItem("Great Ball");
  await field(admin, '[aria-label="Cantidad de objetos"]', "2");
  await evalArgs(admin, () => {
    const button = [
      ...document.querySelectorAll('[role="dialog"] button'),
    ].find((entry) => entry.textContent.trim() === "Aceptar compra");
    button.click();
    button.click();
  });
  await waitBalance(3, 0);
  await waitArgs(
    playerB,
    async () => {
      const bag = (await import("/src/store/store.ts")).store.getState().party
        .bag;
      return bag.money === 0 && bag.items["great-ball"] === 2;
    },
    "confirmed purchase deducts 600 and adds exactly two Great Balls",
  );
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[role="dialog"]')
        ?.textContent.includes("El jugador guardó"),
    "admin sees applied purchase, not only an accepted command",
  );
  await closeDialog("Listo");
  const paid = await shopRepository.get(3);
  assert.equal(paid.purchases.length, 1);
  assert.equal(paid.purchases[0].status, "applied");
  await waitArgs(
    playerB,
    () => !!document.querySelector('button[aria-label="Abrir Bag"]'),
    "player can open the updated Bag",
  );
  await evalArgs(playerB, () =>
    document.querySelector('button[aria-label="Abrir Bag"]').click(),
  );
  await waitArgs(
    playerB,
    () =>
      document
        .querySelector('[data-testid="pokedollars-balance"]')
        ?.textContent.includes("0 Pokedollars") &&
      document
        .querySelector('[data-item-id="great-ball"]')
        ?.textContent.includes("×2"),
    "Bag visibly shows the new balance and two purchased Great Balls",
  );
  assert.equal(
    await evalArgs(
      playerB,
      () => !!document.querySelector('[role="dialog"] input[type="number"]'),
    ),
    false,
    "player Bag has no money editor",
  );
  await openItem("Bicycle");
  assert.equal(
    await evalArgs(admin, acceptEnabled),
    false,
    "insufficient funds blocks confirmation",
  );
  await closeDialog();
  await cdp.request("Page.reload", {}, playerB);
  await waitArgs(
    playerB,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag
        .walletUserId === 3,
    "wallet reload",
  );
  assert.equal(
    (await partyState(playerB)).bag.money,
    0,
    "reload does not replenish the initial 500",
  );
  await cdp.request("Page.reload", {}, admin);
  await waitBalance(3, 0);
  assert.equal(
    await evalArgs(
      admin,
      (selector) => document.querySelector(selector).value,
      `${card(3)} select`,
    ),
    "purple",
  );

  // A local encounter and a reserved admin battle both exclude purchases.
  await evalArgs(playerA, async () => {
    const [{ store }, actions] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/slices/partySlice.ts"),
    ]);
    const own = JSON.parse(JSON.stringify(store.getState().party.pokemons[0]));
    store.dispatch(
      actions.setBattleOpponent({
        kind: "wild",
        encounterId: "shop-local-battle",
        pokemon: own.pokemon,
        moves: own.moves,
        statuses: [],
        stages: own.pokemon.battleStages,
      }),
    );
  });
  await waitArgs(
    admin,
    (selector) =>
      document.querySelector(selector)?.textContent.includes("batalla"),
    "local battle disables purchases",
    card(2),
  );
  await field(admin, `${card(2)} select`, "cyan");
  assert.equal(
    await evalArgs(
      admin,
      (selector) => document.querySelector(selector).value,
      `${card(2)} select`,
    ),
    "cyan",
    "color remains editable during combat",
  );
  await openReset();
  assert.equal(
    await evalArgs(
      playerA,
      () =>
        document.querySelector('[data-testid="confirm-restart-game"]').disabled,
    ),
    true,
    "a local battle prevents starting a new game",
  );
  await clickButton(playerA, "Cancelar", "[role=dialog]");
  await evalArgs(playerA, async () => {
    const [{ store }, actions] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/slices/partySlice.ts"),
    ]);
    store.dispatch(actions.setBattleOpponent(null));
  });
  await clickButton(admin, "Panel batalla");
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll("button")].some(
        (button) => button.textContent.trim() === "Trainer Battle",
      ),
    "battle panel lazy module is ready",
  );
  await clickButton(admin, "Trainer Battle");
  await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
  await clickButton(admin, "Solicitar equipo y preparar Trainer");
  await waitArgs(
    playerA,
    () => !!document.querySelector('[data-testid="pvp-party-lock"]'),
    "admin battle reserves the player's party",
  );
  assert.equal(
    await evalArgs(
      playerA,
      () => !!document.querySelector('[data-testid="player-menu"]'),
    ),
    false,
    "a reserved Trainer battle cannot be bypassed by restarting the party",
  );
  await clickButton(admin, "Tienda");
  await waitArgs(
    admin,
    (selector) =>
      document.querySelector(selector)?.textContent.includes("batalla"),
    "server battle reservation disables purchases",
    card(2),
  );
  await field(admin, `${card(2)} select`, "green");
  await clickButton(admin, "Panel batalla");
  await clickButton(admin, "Cancelar preparación");
  await waitArgs(
    playerA,
    () => !document.querySelector('[data-testid="pvp-party-lock"]'),
    "preparation cancellation releases the player",
  );
  await clickButton(admin, "Tienda");
  await waitArgs(
    admin,
    (selector) => {
      const button = document
        .querySelector(selector)
        ?.querySelector("button[aria-pressed]");
      return button && !button.disabled;
    },
    "player is available after battle",
    card(2),
  );

  await select(2);
  await openItem("Great Ball");
  await cdp.request("Page.navigate", { url: "about:blank" }, playerA);
  for (const socket of shopGateway.namespace.sockets.values())
    if (socket.data.identity?.user.id === 2) socket.disconnect(true);
  await waitArgs(
    admin,
    (selector) => !document.querySelector(selector),
    "disconnected players leave the shop roster",
    card(2),
  );
  assert.equal(await evalArgs(admin, acceptEnabled), false);
  await closeDialog();
  assert.equal((await shopRepository.get(2)).balance, 500);
  await cdp.request(
    "Page.navigate",
    { url: frontendUrl + "/dashboard" },
    playerA,
  );
  await waitBalance(2, 500);
  await waitArgs(
    admin,
    (selector) =>
      !document.querySelector(selector).querySelector("button[aria-pressed]")
        .disabled,
    "reconnected player ready",
    card(2),
  );

  // A debit accepted by Mongo remains pending if local persistence fails.
  // Reload recovers it and the same receipt cannot charge or grant items twice.
  await evalArgs(playerA, () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "persist:root:user:2") {
        try {
          const party = JSON.parse(JSON.parse(value).party);
          if (
            party.bag?.money === 200 &&
            party.bag?.items?.["great-ball"] === 1
          )
            throw new Error("QA checked wallet write failure");
        } catch (error) {
          if (error.message === "QA checked wallet write failure") throw error;
        }
      }
      return original.call(this, key, value);
    };
  });
  await select(2);
  await openItem("Great Ball");
  await clickButton(admin, "Aceptar compra", "[role=dialog]");
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[role="dialog"]')
        ?.textContent.includes("Esperando guardado"),
    "failed local save never reports purchase completed",
  );
  const pending = await shopRepository.get(2);
  assert.equal(pending.balance, 200);
  assert.equal(pending.items["great-ball"], 1);
  assert.equal(pending.purchases[0].status, "pending");
  assert.ok(
    (await partyState(playerA)).shopLock,
    "the party stays frozen until the purchase is recovered",
  );
  assert.equal(
    await evalArgs(
      playerA,
      () => !!document.querySelector('[data-testid="player-menu"]'),
    ),
    false,
    "a pending purchase hides restart controls until its checked save succeeds",
  );
  await closeDialog("Cerrar");
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async () => {
      const party = (await import("/src/store/store.ts")).store.getState()
        .party;
      return (
        !party.shopLock &&
        party.bag.money === 200 &&
        party.bag.items["great-ball"] === 1
      );
    },
    "reload applies the pending wallet and releases its purchase lock",
  );
  await waitArgs(
    admin,
    (selector) =>
      !document
        .querySelector(selector)
        ?.textContent.includes("Esperando guardado de una compra"),
    "admin sees the recovered receipt",
    card(2),
  );
  const recovered = await shopRepository.get(2);
  assert.equal(recovered.purchases.length, 1);
  assert.equal(recovered.purchases[0].status, "applied");
  await shopGateway.publish();
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag
        .walletUserId === 2,
    "second wallet reload",
  );
  assert.equal((await partyState(playerA)).bag.money, 200);
  assert.equal((await partyState(playerA)).bag.items["great-ball"], 1);

  // A new game is a player command, never an incidental shop sync or reload.
  const beforeReset = await shopRepository.get(2);
  console.log(
    "Shop Chrome: purchase guards and recovery passed; testing player new-game reset.",
  );
  const beforeResetParty = await partyState(playerA);
  assert.equal(beforeResetParty.pokemons.length, 1);
  await openReset();
  await clickButton(playerA, "Cancelar", "[role=dialog]");
  await waitArgs(
    playerA,
    () => !document.querySelector('[role="dialog"]'),
    "cancelling a new game closes confirmation without changing the save",
  );
  assert.equal((await shopRepository.get(2)).revision, beforeReset.revision);
  assert.equal((await partyState(playerA)).bag.money, 200);
  assert.equal((await partyState(playerA)).pokemons.length, 1);

  await openReset();
  await confirmResetTwice();
  await waitResetSaved(
    "a confirmed new game clears the team and purchased objects",
  );
  await waitBalance(2, 500);
  const firstReset = await shopRepository.get(2);
  assert.equal(firstReset.revision, beforeReset.revision + 1);
  assert.equal(firstReset.balance, 500);
  assert.deepEqual(firstReset.items, {});
  assert.equal(
    firstReset.resets.length,
    1,
    "double click creates one reset receipt",
  );
  assert.equal(firstReset.resets[0].status, "applied");
  assert.deepEqual(
    firstReset.purchases,
    beforeReset.purchases,
    "starting a new game preserves the purchase audit and idempotency keys",
  );
  assert.equal((await partyState(playerA)).gameSettings, null);
  assert.deepEqual((await partyState(playerA)).bag.badges, []);

  await cdp.request("Page.reload", {}, playerA);
  await waitResetSaved("reloading a fresh game preserves its confirmed reset");
  console.log(
    "Shop Chrome: player reset/cancel/double click passed; checking subsequent purchases and offline guard.",
  );
  assert.equal((await shopRepository.get(2)).resets.length, 1);
  // Prepare a new local team and spend again. A repeated old receipt must not
  // erase this new team or refill its later balance.
  await waitArgs(
    playerA,
    async (revision) => {
      const [{ store }, storage] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/store/accountStorage.ts"),
      ]);
      const party = store.getState().party;
      return (
        party.bag.walletUserId === 2 &&
        party.bag.walletRevision === revision &&
        !storage.isLocalPartyMutationBlocked(party)
      );
    },
    "new game is fully synchronized before installing its next team fixture",
    firstReset.revision,
  );
  await seedPvpTeam(playerA, 1, 40, 1.3);
  const seededAfterReset = await evalArgs(playerA, async () => {
    const storage = await import("/src/store/accountStorage.ts");
    return storage.readAccountParty(2)?.party.pokemons.length;
  });
  assert.equal(seededAfterReset, 1, "the next team fixture is durably saved");
  await select(2);
  await openItem("Poké Ball");
  await clickButton(admin, "Aceptar compra", "[role=dialog]");
  await waitBalance(2, 350);
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[role="dialog"]')
        ?.textContent.includes("El jugador guardó"),
    "a purchase after the new game saves normally",
  );
  await closeDialog("Listo");
  await shopGateway.publish();
  await cdp.request("Page.reload", {}, playerA);
  try {
    await waitArgs(
      playerA,
      async () => {
        const party = (await import("/src/store/store.ts")).store.getState()
          .party;
        return (
          party.bag.money === 350 &&
          party.bag.items["poke-ball"] === 1 &&
          party.pokemons.length === 1 &&
          !party.resetLock
        );
      },
      "old reset receipts do not erase new Pokémon or replenish later purchases",
    );
  } catch (error) {
    const actualParty = await partyState(playerA);
    const disk = await evalArgs(playerA, async () => {
      const storage = await import("/src/store/accountStorage.ts");
      const party = storage.readAccountParty(2)?.party;
      return (
        party && {
          bag: party.bag,
          teamCount: party.pokemons.length,
          resetLock: party.resetLock,
        }
      );
    });
    throw new Error(
      `${error.message}; player=${JSON.stringify({ bag: actualParty.bag, teamCount: actualParty.pokemons.length, resetLock: actualParty.resetLock })}; disk=${JSON.stringify(disk)}; server=${JSON.stringify(await shopRepository.get(2))}`,
    );
  }
  await waitBalance(2, 350);
  assert.equal((await shopRepository.get(2)).resets.length, 1);

  // Offline confirmation must be unavailable and leave the current party intact.
  const beforeOffline = await partyState(playerA);
  await cdp.request("Network.enable", {}, playerA);
  await cdp.request(
    "Network.emulateNetworkConditions",
    { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    playerA,
  );
  for (const socket of shopGateway.namespace.sockets.values())
    if (socket.data.identity?.user.id === 2) socket.disconnect(true);
  await openReset();
  await waitArgs(
    playerA,
    () =>
      document.querySelector('[data-testid="confirm-restart-game"]')?.disabled,
    "offline players cannot confirm a new game",
  );
  await clickButton(playerA, "Cancelar", "[role=dialog]");
  assert.equal((await partyState(playerA)).bag.money, beforeOffline.bag.money);
  assert.equal((await partyState(playerA)).pokemons.length, 1);
  assert.equal((await shopRepository.get(2)).resets.length, 1);
  await cdp.request(
    "Network.emulateNetworkConditions",
    {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    },
    playerA,
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitBalance(2, 350);
  await waitArgs(
    admin,
    (selector) => {
      const button = document
        .querySelector(selector)
        ?.querySelector("button[aria-pressed]");
      return button && !button.disabled;
    },
    "player is synchronized before a durable reset failure",
    card(2),
  );

  // The server can accept a reset while the final local checked write fails.
  // Keep both the old team and a durable intent until that same receipt is saved.
  await evalArgs(playerA, () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "persist:root:user:2") {
        try {
          const party = JSON.parse(JSON.parse(value).party);
          if (party.pokemons.length === 0 && party.bag?.money === 500)
            throw new Error("QA checked reset write failure");
        } catch (error) {
          if (error.message === "QA checked reset write failure") throw error;
        }
      }
      return original.call(this, key, value);
    };
  });
  const beforeFailedReset = await shopRepository.get(2);
  console.log(
    "Shop Chrome: reload and offline guard passed; testing interrupted reset persistence.",
  );
  await openReset();
  await confirmResetTwice();
  await waitArgs(
    playerA,
    () => !!document.querySelector('[data-testid="shop-reset-lock"]'),
    "failed reset remains recoverable through a dedicated persistent lock",
  );
  await waitBalance(2, 500);
  const resetPending = await shopRepository.get(2);
  assert.equal(resetPending.revision, beforeFailedReset.revision + 1);
  assert.equal(resetPending.resets.length, 2);
  assert.equal(resetPending.resets[1].status, "pending");
  assert.deepEqual(resetPending.items, {});
  assert.ok((await partyState(playerA)).resetLock);
  assert.equal(
    (await partyState(playerA)).pokemons.length,
    1,
    "failed local persistence preserves the old team until recovery",
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitResetSaved(
    "reload recovers the same reset after storage starts working",
  );
  const resetRecovered = await shopRepository.get(2);
  assert.equal(resetRecovered.resets.length, 2);
  assert.equal(resetRecovered.resets[1].status, "applied");
  assert.equal(resetRecovered.revision, resetPending.revision);
  assert.deepEqual(resetRecovered.purchases, beforeFailedReset.purchases);
  await shopGateway.publish();
  await cdp.request("Page.reload", {}, playerA);
  await waitResetSaved(
    "a second reload does not repeat or re-credit the reset",
  );
  assert.equal((await shopRepository.get(2)).revision, resetPending.revision);
  await fullRestoreBrowserScenario({
    admin,
    playerA,
    cdp,
    evalArgs,
    waitArgs,
    clickButton,
    field,
    seedPvpTeam,
    shopRepository,
    shopGateway,
    select,
    openItem,
    closeDialog,
  });
  await ppItemsBrowserScenario({
    admin,
    playerA,
    cdp,
    evalArgs,
    waitArgs,
    clickButton,
    field,
    seedPvpTeam,
    shopRepository,
    shopGateway,
    select,
    openItem,
    closeDialog,
  });
  await tmBrowserScenario({
    admin,
    playerA,
    cdp,
    evalArgs,
    waitArgs,
    clickButton,
    field,
    seedPvpTeam,
    shopRepository,
    shopGateway,
    select,
    openItem,
    closeDialog,
  });
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
  console.log(
    "PASS: live Poké Mart, 600/Great Ball quantity2, read-only cash, live objects/balances, battle locks, durable purchase recovery, and player new games: 500 Pokedollars, empty purchased inventory/team, cancel/offline guards, double-click deduplication, checked-save recovery and no repeated reset on reload.",
  );
}
