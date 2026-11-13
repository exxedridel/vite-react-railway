import assert from "node:assert/strict";

export async function backOfficeBrowserScenario({
  admin,
  playerA,
  playerB,
  cdp,
  evalArgs,
  waitArgs,
  field,
  clickButton,
  seedPvpTeam,
  shopRepository,
  shopGateway,
  shopService,
  select,
  openItem,
  closeDialog,
}) {
  const route = async (page, path) => {
    const origin = await evalArgs(page, () => location.origin);
    await cdp.request("Page.stopLoading", {}, page);
    await cdp.request("Page.navigate", { url: origin + path }, page);
    await waitArgs(page, async expected => location.pathname === expected && !!document.querySelector(expected === "/dashboard" ? 'a[href="/mensajes-prueba"]' : 'main') && (await import("/src/store/accountStorage.ts")).getActiveAccountId() !== null, `route and saved account ready: ${path}`, path);
  };
  const state = (page) =>
    evalArgs(page, async () =>
      JSON.parse(
        JSON.stringify(
          (await import("/src/store/store.ts")).store.getState().party,
        ),
      ),
    );
  await route(playerA, "/back-office");
  await waitArgs(
    playerA,
    () =>
      document.body.textContent.includes("Acceso reservado al administrador"),
    "player cannot open back office",
  );
  await route(playerA, "/dashboard");
  await seedPvpTeam(playerA, 1, 40, 1.3);
  await route(admin, "/back-office");
  await waitArgs(
    admin,
    () => !!document.querySelector('input[aria-label="Precio de Poké Ball"]'),
    "admin back office route",
  );
  const email = await evalArgs(
    admin,
    () =>
      document.querySelector('[data-testid="back-office-player-2"] p')
        .textContent,
  );
  const amountSelector = `input[aria-label="Cantidad de Pokedollars para ${email}"]`;
  const balance = async () => (await shopRepository.get(2)).balance;
  const before = await state(playerA),
    initial = await balance();
  async function adjust(value, sign, holdStorage = false) {
    await waitArgs(
      admin,
      (selector) => {
        const i = document.querySelector(selector);
        return i && !i.disabled;
      },
      "player available for balance adjustment",
      amountSelector,
    );
    await field(admin, amountSelector, String(value));
    await evalArgs(
      admin,
      (label) =>
        document.querySelector(`button[aria-label="${label}"]`).click(),
      `${sign > 0 ? "Agregar" : "Quitar"} Pokedollars a ${email}`,
    );
    await waitArgs(
      admin,
      () => !!document.querySelector('[data-testid="balance-adjust-confirm"]'),
      "review balance adjustment",
    );
    if (holdStorage)
      await evalArgs(playerA, () => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "persist:root:user:2") {
            const p = JSON.parse(JSON.parse(value).party);
            if (
              p.shopLock?.operation === "balance-adjustment" &&
              p.shopLock.appliedWalletRevision !== undefined
            )
              throw new Error("QA interrupted balance save");
          }
          return original.call(this, key, value);
        };
      });
    await evalArgs(admin, () => {
      const b = document.querySelector(
        '[data-testid="balance-adjust-confirm"]',
      );
      b.click();
      b.click();
    });
    if (holdStorage) {
      await waitArgs(
        playerA,
        () => !!document.querySelector('[data-testid="balance-adjust-lock"]'),
        "balance lock survives checked-save failure",
      );
      await waitArgs(
        admin,
        () =>
          document
            .querySelector("[role=dialog]")
            ?.textContent.includes("Esperando guardado"),
        "durable pending balance receipt",
      );
      await cdp.request("Page.reload", {}, playerA);
    }
    await waitArgs(
      admin,
      () =>
        [...document.querySelectorAll("[role=dialog] button")].some(
          (b) => b.textContent === "Listo" && !b.disabled,
        ) &&
        document
          .querySelector("[role=dialog]")
          ?.textContent.includes("El jugador guardó el ajuste."),
      "balance saved and acknowledged",
    );
    await clickButton(admin, "Listo", "[role=dialog]");
    await waitArgs(
      playerA,
      async () =>
        !(await import("/src/store/store.ts")).store.getState().party.shopLock,
      "player balance unlocked",
    );
  }
  await adjust(250, 1);
  assert.equal(await balance(), initial + 250);
  await adjust(100, -1, true);
  assert.equal(await balance(), initial + 150);
  assert.equal((await shopRepository.get(2)).adjustments.length, 2);
  const after = await state(playerA);
  assert.deepEqual(after.pokemons, before.pokemons);
  assert.deepEqual(after.bag.items, before.bag.items);
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async (expected) =>
      (await import("/src/store/store.ts")).store.getState().party.bag.money ===
      expected,
    "balance survives a second reload",
    initial + 150,
  );
  assert.equal((await shopRepository.get(2)).adjustments.length, 2);
  await field(admin, amountSelector, String(initial + 151));
  assert.equal(
    await evalArgs(
      admin,
      (label) =>
        document.querySelector(`button[aria-label="${label}"]`).disabled,
      `Quitar Pokedollars a ${email}`,
    ),
    true,
  );
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
    ]);
    await transactPvpParty(2, async (current) => {
      const p = JSON.parse(JSON.stringify(current));
      p.opponent = {
        kind: "trainer",
        pokemon: JSON.parse(JSON.stringify(p.pokemons[0].pokemon)),
        moves: p.pokemons[0].moves,
        statuses: [],
        stages: {},
        encounterId: "backoffice-busy",
      };
      p.pvpRevision = storage.pvpPartyRevision(current) + 1;
      return { party: p, value: undefined };
    });
  });
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[data-testid="back-office-player-2"]')
        ?.textContent.includes("En batalla"),
    "battle prevents balance adjustments",
  );
  assert.equal(
    await evalArgs(
      admin,
      (selector) => document.querySelector(selector).disabled,
      amountSelector,
    ),
    true,
  );
  async function price(value) {
    await field(
      admin,
      'input[aria-label="Precio de Poké Ball"]',
      String(value),
    );
    await evalArgs(admin, () =>
      document
        .querySelector('button[aria-label="Guardar precio de Poké Ball"]')
        .click(),
    );
    await waitArgs(
      admin,
      (v) =>
        document
          .querySelector('[data-item-id="poke-ball"]')
          ?.textContent.includes(`Vigente: ${v} PD`),
      "price saved during battle",
      value,
    );
  }
  await price(0);
  assert.equal((await shopService.catalog.snapshot()).prices["poke-ball"], 0);
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
    ]);
    await transactPvpParty(2, async (current) => {
      const p = {
        ...current,
        opponent: null,
        pvpRevision: storage.pvpPartyRevision(current) + 1,
      };
      return { party: p, value: undefined };
    });
  });
  await route(admin, "/dashboard");
  await clickButton(admin, "Tienda");
  await select(2);
  await openItem("Poké Ball");
  await field(admin, 'input[aria-label="Cantidad de objetos"]', "99");
  const beforeFree = await shopRepository.get(2);
  await clickButton(admin, "Aceptar compra", "[role=dialog]");
  await waitArgs(
    admin,
    () =>
      document
        .querySelector("[role=dialog]")
        ?.textContent.includes("El jugador guardó") &&
      [...document.querySelectorAll("[role=dialog] button")].some(
        (b) => b.textContent === "Listo" && !b.disabled,
      ),
    "free purchase delivered",
  );
  await closeDialog("Listo");
  const free = await shopRepository.get(2);
  assert.equal(free.balance, beforeFree.balance);
  assert.equal(
    free.items["poke-ball"],
    (beforeFree.items["poke-ball"] ?? 0) + 99,
  );
  assert.equal(free.purchases.at(-1).total, 0);
  await select(2);
  await openItem("Poké Ball");
  const beforeStale = await shopRepository.get(2);
  await shopService.catalog.setPrice(1, {
    requestId: "external-price",
    itemId: "poke-ball",
    price: 25,
    expectedCatalogRevision: (await shopService.catalog.snapshot()).revision,
  });
  await shopGateway.publish();
  await waitArgs(
    admin,
    () =>
      document
        .querySelector("[role=dialog]")
        ?.textContent.includes("Actualizar cotización"),
    "live catalog change invalidates open quote",
  );
  assert.equal(
    await evalArgs(
      admin,
      () =>
        [...document.querySelectorAll("[role=dialog] button")].find(
          (b) => b.textContent === "Aceptar compra",
        ).disabled,
    ),
    true,
  );
  await clickButton(admin, "Actualizar cotización", "[role=dialog]");
  await clickButton(admin, "Aceptar compra", "[role=dialog]");
  await waitArgs(
    admin,
    () =>
      document
        .querySelector("[role=dialog]")
        ?.textContent.includes("El jugador guardó") &&
      [...document.querySelectorAll("[role=dialog] button")].some(
        (b) => b.textContent === "Listo" && !b.disabled,
      ),
    "updated-price purchase delivered",
  );
  await closeDialog("Listo");
  assert.equal((await shopRepository.get(2)).balance, beforeStale.balance - 25);
  await route(admin, "/back-office");
  await waitArgs(
    admin,
    () => !!document.querySelector('input[aria-label="Precio de Poké Ball"]'),
    "catalog reload",
  );
  assert.equal(
    await evalArgs(
      admin,
      () =>
        document.querySelector('input[aria-label="Precio de Poké Ball"]').value,
    ),
    "25",
  );
  console.log(
    "PASS: Back office admin access, zero/dynamic prices, stale quote fencing, free purchase99, +/-balance, no negatives/battle, double click, interrupted checked save/reload and Party preservation.",
  );
}
