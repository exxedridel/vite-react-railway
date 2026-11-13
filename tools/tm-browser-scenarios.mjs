import assert from "node:assert/strict";

/** Exercises real player learning and the Nest inventory receipt, not a free dispatch. */
export async function tmBrowserScenario({
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
  select,
  openItem,
  closeDialog,
}) {
  const row = await shopRepository.get(2),
    previous = row.storageRevision;
  row.balance = 2000;
  row.revision++;
  row.storageRevision++;
  assert.equal(await shopRepository.compareAndSwap(row, previous), true);
  await shopGateway.publish();
  await waitArgs(
    playerA,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag.money ===
      2000,
    "TM wallet synchronized",
  );
  await seedPvpTeam(playerA, 1, 65, 1.3);
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty, store }, storage, catalog, api] =
      await Promise.all([
        import("/src/store/store.ts"),
        import("/src/store/accountStorage.ts"),
        import("/src/lib/trainerBattle/catalog.ts"),
        import("/src/api/pokeApi.ts"),
      ]);
    const moves = [150, 33, 45].map((id) =>
      catalog.trainerMoves.find((move) => move.id === id),
    );
    for (const move of moves)
      await store.dispatch(
        api.pokeApi.util.upsertQueryData("getMove", move.id, move),
      );
    await transactPvpParty(2, async (current) => {
      const party = JSON.parse(JSON.stringify(current));
      party.opponent = null;
      delete party.emerald;
      party.pokemons[0].statuses = [];
      party.pokemons[0].moves = [{ ...moves[0], currentPp: 3 }];
      party.pokemons[0].pokemon.learnset = {
        versionGroup: "emerald",
        moves: moves.map((move) => ({ id: move.id, name: move.name })),
      };
      party.pvpRevision = storage.pvpPartyRevision(current) + 1;
      return { party, value: undefined };
    });
  });
  const state = () =>
    evalArgs(playerA, async () =>
      JSON.parse(
        JSON.stringify(
          (await import("/src/store/store.ts")).store.getState().party,
        ),
      ),
    );
  async function openMoves() {
    await waitArgs(
      playerA,
      () =>
        !!document.querySelector(
          'button[aria-label="Abrir combate de clefairy"]',
        ),
      "TM Pokémon panel available",
    );
    await evalArgs(playerA, () =>
      document
        .querySelector('button[aria-label="Abrir combate de clefairy"]')
        .click(),
    );
    await waitArgs(
      playerA,
      () =>
        [...document.querySelectorAll("details")].some(
          (details) =>
            details
              .querySelector(":scope > summary")
              ?.textContent.trim()
              .toLowerCase() === "battle moves",
        ),
      "TM moves accordion available",
    );
    await evalArgs(playerA, () => {
      const details = [...document.querySelectorAll("details")].find(
        (entry) =>
          entry
            .querySelector(":scope > summary")
            ?.textContent.trim()
            .toLowerCase() === "battle moves",
      );
      details.open = true;
    });
  }
  async function closeBattle() {
    await evalArgs(playerA, () =>
      document
        .querySelector('button[aria-label="Cerrar combate y volver al equipo"]')
        .click(),
    );
    await waitArgs(
      playerA,
      () =>
        !document.querySelector(
          'button[aria-label="Cerrar combate y volver al equipo"]',
        ),
      "TM Pokémon panel closed",
    );
  }
  async function addEnabled(expected) {
    await waitArgs(
      playerA,
      (expected) => {
        const button = [...document.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === "Aprender con TM",
        );
        return !!button && button.disabled !== expected;
      },
      `TM add button enabled=${expected}`,
      expected,
    );
  }
  async function openPicker(moveName) {
    await addEnabled(true);
    await evalArgs(playerA, () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent.trim() === "Aprender con TM")
        .click(),
    );
    await waitArgs(
      playerA,
      (name) =>
        [
          ...document.querySelectorAll(
            '[aria-label="Movimientos compatibles"] button',
          ),
        ].some((b) => b.textContent.includes(name)),
      "TM compatible move loaded",
      moveName,
    );
    await evalArgs(
      playerA,
      (name) =>
        [
          ...document.querySelectorAll(
            '[aria-label="Movimientos compatibles"] button',
          ),
        ]
          .find((b) => b.textContent.includes(name))
          .click(),
      moveName,
    );
  }
  async function confirmTwice() {
    await waitArgs(
      playerA,
      () => {
        const dialog = document
          .querySelector('input[aria-label="Buscar movimiento"]')
          ?.closest('[role="dialog"]');
        const button =
          dialog &&
          [...dialog.querySelectorAll("button")].find(
            (b) =>
              b.dataset.testid === "tm-confirm" ||
              (/TM/.test(b.textContent) &&
                /aprender|sustituir/i.test(b.textContent)),
          );
        return button && !button.disabled;
      },
      "TM learning confirmation enabled",
    );
    await evalArgs(playerA, () => {
      const dialog = document
        .querySelector('input[aria-label="Buscar movimiento"]')
        .closest('[role="dialog"]');
      const button = [...dialog.querySelectorAll("button")].find(
        (b) =>
          b.dataset.testid === "tm-confirm" ||
          (/TM/.test(b.textContent) &&
            /aprender|sustituir/i.test(b.textContent)),
      );
      button.click();
      button.click();
    });
  }
  async function learned(id, stock) {
    await waitArgs(
      playerA,
      async (id, stock) => {
        const [{ store }, storage] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
        ]);
        const party = store.getState().party;
        const move = party.pokemons[0]?.moves?.find((move) => move.id === id);
        return (
          !!move &&
          move.currentPp === move.pp &&
          party.bag.items.tm === stock &&
          !party.itemUseLock &&
          !storage.isLocalPartyMutationBlocked(party)
        );
      },
      `TM learned ${id} with stock ${stock}`,
      id,
      stock,
    );
  }
  assert.equal((await state()).bag.items.tm ?? 0, 0);
  await openMoves();
  await addEnabled(false);
  await closeBattle();
  await clickButton(admin, "Tienda");
  await select(2);
  await openItem("TM");
  await field(admin, 'input[aria-label="Cantidad de objetos"]', "2");
  await clickButton(admin, "Aceptar compra", "[role=dialog]");
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll('[role="dialog"] button')].some(
        (button) => button.textContent.trim() === "Listo" && !button.disabled,
      ),
    "TM purchase delivered",
  );
  await closeDialog("Listo");
  const purchased = await shopRepository.get(2);
  assert.equal(purchased.balance, 1000);
  assert.equal(purchased.items.tm, 2);
  assert.equal(purchased.purchases.at(-1).unitPrice, 500);
  assert.equal(purchased.purchases.at(-1).quantity, 2);
  const priorUses = purchased.uses.filter((use) => use.itemId === "tm").length;

  await openMoves();
  await openPicker("Tackle");
  await evalArgs(playerA, () => {
    const dialog = document
      .querySelector('input[aria-label="Buscar movimiento"]')
      .closest('[role="dialog"]');
    [...dialog.querySelectorAll("button")]
      .find((b) => b.textContent.trim() === "Cancelar")
      .click();
  });
  await waitArgs(
    playerA,
    () => !document.querySelector('input[aria-label="Buscar movimiento"]'),
    "cancelled TM selector closes",
  );
  assert.equal((await state()).bag.items.tm, 2);
  assert.deepEqual(
    (await state()).pokemons[0].moves.map((move) => move.id),
    [150],
  );
  assert.equal(
    (await shopRepository.get(2)).uses.filter((use) => use.itemId === "tm")
      .length,
    priorUses,
  );
  await openPicker("Tackle");
  await confirmTwice();
  await learned(33, 1);
  let current = await state();
  assert.equal(
    current.pokemons[0].moves.find((move) => move.id === 150).currentPp,
    3,
  );
  assert.deepEqual(
    current.pokemons[0].moves.map((move) => move.id),
    [150, 33],
  );
  assert.equal(
    (await shopRepository.get(2)).uses.filter((use) => use.itemId === "tm")
      .length,
    priorUses + 1,
  );
  await closeBattle();
  await cdp.request("Page.reload", {}, playerA);
  await learned(33, 1);

  // A live encounter disables learning even while this account has stock.
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
    ]);
    await transactPvpParty(2, async (latest) => {
      const party = JSON.parse(JSON.stringify(latest));
      party.opponent = {
        kind: "wild",
        encounterId: "tm-forbidden-battle",
        pokemon: JSON.parse(JSON.stringify(party.pokemons[0].pokemon)),
        moves: [party.pokemons[0].moves[0]],
        statuses: [],
        stages: {},
      };
      party.pvpRevision = storage.pvpPartyRevision(latest) + 1;
      return { party, value: undefined };
    });
  });
  await openMoves();
  await addEnabled(false);
  assert.equal((await shopRepository.get(2)).items.tm, 1);
  await closeBattle();
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
    ]);
    await transactPvpParty(2, async (latest) => {
      const party = JSON.parse(JSON.stringify(latest));
      party.opponent = null;
      delete party.emerald;
      party.pvpRevision = storage.pvpPartyRevision(latest) + 1;
      return { party, value: undefined };
    });
  });
  await openMoves();
  await addEnabled(true);
  await cdp.request("Network.enable", {}, playerA);
  await cdp.request(
    "Network.emulateNetworkConditions",
    { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    playerA,
  );
  for (const socket of shopGateway.namespace.sockets.values())
    if (socket.data.identity?.user.id === 2) socket.disconnect(true);
  await addEnabled(false);
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
  await learned(33, 1);
  // Refill the local catalog cache after reloading; no external API is required.
  await evalArgs(playerA, async () => {
    const [{ store }, { pokeApi }, { trainerMoves }] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/api/pokeApi.ts"),
      import("/src/lib/trainerBattle/catalog.ts"),
    ]);
    for (const id of [150, 33, 45])
      await store.dispatch(
        pokeApi.util.upsertQueryData(
          "getMove",
          id,
          trainerMoves.find((move) => move.id === id),
        ),
      );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "persist:root:user:2") {
        const party = JSON.parse(JSON.parse(value).party);
        if (
          party.bag.items.tm === 0 &&
          party.pokemons[0]?.moves.some((move) => move.id === 45)
        )
          throw new Error("QA TM effect persistence failure");
      }
      return original.call(this, key, value);
    };
  });
  await openMoves();
  await openPicker("Growl");
  await confirmTwice();
  await waitArgs(
    playerA,
    () =>
      !!document.querySelector(
        '[role="alertdialog"][data-testid="item-use-lock"]',
      ),
    "TM failed effect save retains recoverable modal",
  );
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[data-testid="shop-player-2"]')
        ?.textContent.includes("Confirmando el uso"),
    "failed TM consumption is durably pending in the admin shop",
  );
  const pending = await shopRepository.get(2);
  assert.equal(pending.items.tm, 0);
  assert.equal(
    pending.uses.filter((use) => use.itemId === "tm").length,
    priorUses + 2,
  );
  assert.equal(pending.uses.at(-1).status, "pending");
  assert.equal(
    (await state()).pokemons[0].moves.some((move) => move.id === 45),
    false,
  );
  await cdp.request("Page.reload", {}, playerA);
  await learned(45, 0);
  current = await state();
  assert.deepEqual(
    current.pokemons[0].moves.map((move) => move.id),
    [150, 33, 45],
  );
  assert.equal(
    current.pokemons[0].moves.find((move) => move.id === 150).currentPp,
    3,
  );
  const recovered = await shopRepository.get(2);
  assert.equal(recovered.revision, pending.revision);
  assert.equal(recovered.balance, 1000);
  assert.equal(recovered.uses.at(-1).status, "applied");
  await cdp.request("Page.reload", {}, playerA);
  await learned(45, 0);
  assert.equal(
    (await shopRepository.get(2)).uses.filter((use) => use.itemId === "tm")
      .length,
    priorUses + 2,
  );
  await openMoves();
  await addEnabled(false);
  await closeBattle();
  console.log(
    "TM Chrome: purchase500, compatible learning, cancel/no stock/offline/battle guards, exact one-item double-click debit, full PP, reload and checked-save recovery passed.",
  );
  await evalArgs(playerA, async () => {
    const [
      { transactPvpParty, store },
      storage,
      { trainerMoves },
      { pokeApi },
    ] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
      import("/src/lib/trainerBattle/catalog.ts"),
      import("/src/api/pokeApi.ts"),
    ]);
    const reserveMove = trainerMoves.find((move) => move.id === 111);
    await transactPvpParty(2, async (latest) => {
      const party = JSON.parse(JSON.stringify(latest));
      party.pokemons[0].moves.push({ ...reserveMove, currentPp: 7 });
      party.pokemons[0].pokemon.learnset.moves.push(
        { id: 111, name: reserveMove.name },
        { id: 1, name: trainerMoves.find((move) => move.id === 1).name },
      );
      party.pvpRevision = storage.pvpPartyRevision(latest) + 1;
      return { party, value: undefined };
    });
    for (const id of [150, 33, 45, 111, 1])
      await store.dispatch(
        pokeApi.util.upsertQueryData(
          "getMove",
          id,
          trainerMoves.find((move) => move.id === id),
        ),
      );
  });
  await select(2);
  await openItem("TM");
  await clickButton(admin, "Aceptar compra", "[role=dialog]");
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll('[role="dialog"] button')].some(
        (button) => button.textContent.trim() === "Listo" && !button.disabled,
      ),
    "replacement TM purchase delivered",
  );
  await closeDialog("Listo");
  await openMoves();
  await waitArgs(
    playerA,
    () => {
      const button = document.querySelector(
        'button[aria-label="Sustituir Tackle con una TM"]',
      );
      return button && !button.disabled;
    },
    "four-move Party can replace one move with its purchased TM",
  );
  await evalArgs(playerA, () =>
    document
      .querySelector('button[aria-label="Sustituir Tackle con una TM"]')
      .click(),
  );
  await waitArgs(
    playerA,
    () =>
      [
        ...document.querySelectorAll(
          '[aria-label="Movimientos compatibles"] button',
        ),
      ].some((button) => button.textContent.includes("Pound")),
    "replacement compatible move loaded",
  );
  await evalArgs(playerA, () =>
    [
      ...document.querySelectorAll(
        '[aria-label="Movimientos compatibles"] button',
      ),
    ]
      .find((button) => button.textContent.includes("Pound"))
      .click(),
  );
  await confirmTwice();
  await learned(1, 0);
  const replaced = await state();
  assert.deepEqual(
    replaced.pokemons[0].moves.map((move) => move.id),
    [150, 1, 45, 111],
  );
  assert.equal(
    replaced.pokemons[0].moves.find((move) => move.id === 111).currentPp,
    7,
  );
  assert.equal(
    replaced.pokemons[0].moves.find((move) => move.id === 150).currentPp,
    3,
  );
  const replacementWallet = await shopRepository.get(2);
  assert.equal(replacementWallet.balance, 500);
  assert.equal(replacementWallet.items.tm, 0);
  assert.equal(
    replacementWallet.uses.filter((use) => use.itemId === "tm").length,
    priorUses + 3,
  );
  await cdp.request("Page.reload", {}, playerA);
  await learned(1, 0);
  assert.deepEqual(
    (await state()).pokemons[0].moves.map((move) => move.id),
    [150, 1, 45, 111],
  );
  console.log(
    "PASS: TM Chrome four-move replacement consumes one real TM, preserves unrelated PP and persists after reload.",
  );
}
