import assert from "node:assert/strict";

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
  const select = async (id) =>
    evalArgs(
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
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
  console.log(
    "PASS: live Poké Mart, one-time 500 Pokedollars, read-only player cash, 600/Great Ball quantity2, cancel/insufficient/double click, items and balances live, local/admin battle locks, colors, disconnects and durable purchase recovery without duplicate charges.",
  );
}
