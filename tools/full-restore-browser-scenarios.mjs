import assert from "node:assert/strict";

export async function fullRestoreBrowserScenario({
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
}) {
  const row = await shopRepository.get(2),
    previous = row.storageRevision;
  row.balance = 2000;
  row.revision++;
  row.storageRevision++;
  await shopRepository.compareAndSwap(row, previous);
  await shopGateway.publish();
  await seedPvpTeam(playerA, 1, 40, 1.3);
  await select(2);
  await openItem("Full Restore");
  await field(admin, 'input[aria-label="Cantidad de objetos"]', "3");
  await clickButton(admin, "Aceptar compra", "[role=dialog]");
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return p.bag.items["full-restore"] === 3 && !p.shopLock;
    },
    "three Full Restore purchased and saved",
  );
  await waitArgs(
    admin,
    () =>
      document
        .querySelector("[role=dialog]")
        ?.textContent.includes("El jugador guardó"),
    "purchase delivery complete",
  );
  await closeDialog("Listo");
  async function actions() {
    await waitArgs(
      playerA,
      () =>
        !!document.querySelector('button[aria-label="Acciones de clefairy"]'),
      "party action button",
    );
    await evalArgs(playerA, () =>
      document
        .querySelector('button[aria-label="Acciones de clefairy"]')
        .click(),
    );
    await waitArgs(
      playerA,
      () =>
        !!document.querySelector(
          'button[aria-label="Usar Full Restore en clefairy"]',
        ),
      "Full Restore action dialog",
    );
  }
  async function consumeFromActions() {
    await actions();
    await waitArgs(playerA, () => {
      const button = document.querySelector('button[aria-label="Usar Full Restore en clefairy"]');
      return button && !button.disabled;
    }, "Full Restore is ready after inventory synchronization");
    await evalArgs(playerA, () => {
      const b = document.querySelector(
        'button[aria-label="Usar Full Restore en clefairy"]',
      );
      if (b.disabled) throw new Error("Full Restore unexpectedly unavailable");
      b.click();
      b.click();
    });
  }
  async function saved(count) {
    await waitArgs(
      playerA,
      async (count) => {
        const [{ store }, storage, stats] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
          import("/src/lib/pokemonStats.ts"),
        ]);
        const p = store.getState().party;
        return (
          p.bag.walletUserId === 2 &&
          !p.itemUseLock &&
          !storage.isLocalPartyMutationBlocked(p) &&
          p.bag.items["full-restore"] === count &&
          stats.getCurrentHp(p.pokemons[0]?.pokemon) ===
            stats.getMaxHp(p.pokemons[0]?.pokemon)
        );
      },
      `Full Restore saved with stock ${count}`,
      count,
    );
  }
  await consumeFromActions();
  await saved(2);
  assert.equal((await shopRepository.get(2)).items["full-restore"], 2);
  assert.equal((await shopRepository.get(2)).balance, 950);
  console.log(
    "Full Restore Chrome: dashboard heals and consumes exactly one despite double click.",
  );

  async function hurt(wild) {
    await evalArgs(
      playerA,
      async (wild) => {
        const [{ transactPvpParty }, storage] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
        ]);
        await transactPvpParty(2, async (current) => {
          const p = JSON.parse(JSON.stringify(current)),
            own = p.pokemons[0];
          own.pokemon.stats.find((s) => s.name === "hp").value = 20;
          own.statuses = ["burned"];
          p.emerald = undefined;
          p.opponent = wild
            ? {
                kind: "wild",
                encounterId: "full-restore-wild",
                pokemon: JSON.parse(JSON.stringify(own.pokemon)),
                moves: own.moves,
                statuses: [],
                stages: {},
              }
            : null;
          if (p.opponent)
            p.opponent.pokemon.stats.find((s) => s.name === "hp").value = 65;
          p.pvpRevision = storage.pvpPartyRevision(current) + 1;
          return { party: p, value: undefined };
        });
      },
      wild,
    );
  }
  await hurt(true);
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[data-testid="shop-player-2"]')
        ?.textContent.includes("batalla"),
    "wild presence announced",
  );
  await evalArgs(playerA, () =>
    document
      .querySelector('button[aria-label="Abrir combate de clefairy"]')
      .click(),
  );
  await waitArgs(
    playerA,
    () => !!document.querySelector('[data-testid="battle-full-restore"]'),
    "individual battle Full Restore control",
  );
  await evalArgs(playerA, () => {
    const b = document.querySelector('[data-testid="battle-full-restore"]');
    b.closest("details").open = true;
    b.click();
  });
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        !p.itemUseLock &&
        p.bag.items["full-restore"] === 1 &&
        p.emerald?.pending.player?.kind === "item"
      );
    },
    "paid native item occupies the player's action",
  );
  await evalArgs(playerA, async () => {
    const [{ store }, commands] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/lib/emerald/commands.ts"),
    ]);
    await store.dispatch(
      commands.submitEmeraldAction(
        store.getState().party.pokemons[0].captureId,
        "opponent",
        { kind: "move", moveId: 150 },
      ),
    );
  });
  await saved(1);
  console.log(
    "Full Restore Chrome: individual native turn consumes one action and one item.",
  );
  await cdp.request("Page.reload", {}, playerA);
  await saved(1);
  await hurt(false);
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[data-testid="shop-player-2"]')
        ?.textContent.includes("Disponible"),
    "player available outside encounter",
  );
  await evalArgs(playerA, () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "persist:root:user:2") {
        const p = JSON.parse(JSON.parse(value).party);
        if (
          p.bag.items?.["full-restore"] === 0 &&
          p.pokemons[0]?.pokemon.stats.find((s) => s.name === "hp").value > 20
        )
          throw new Error("QA Full Restore save failure");
      }
      return original.call(this, key, value);
    };
  });
  await consumeFromActions();
  await waitArgs(
    playerA,
    () => !!document.querySelector('[data-testid="item-use-lock"]'),
    "failed local item save has a recovery gate",
  );
  await waitArgs(
    admin,
    () =>
      document
        .querySelector('[data-testid="shop-player-2"]')
        ?.textContent.includes("Confirmando el uso"),
    "pending item is durable",
  );
  assert.equal((await shopRepository.get(2)).items["full-restore"], 0);
  await cdp.request("Page.reload", {}, playerA);
  await saved(0);
  assert.equal((await shopRepository.get(2)).uses.length, 3);
  await actions();
  assert.equal(
    await evalArgs(
      playerA,
      () =>
        document.querySelector(
          'button[aria-label="Usar Full Restore en clefairy"]',
        ).disabled,
    ),
    true,
  );
  await cdp.request("Page.reload", {}, playerA);
  await saved(0);
  console.log(
    "Full Restore Chrome: zero stock and interrupted-save recovery passed, no repeated debit/heal.",
  );

  await select(2);
  await openItem("Full Restore");
  await clickButton(admin, "Aceptar compra", "[role=dialog]");
  await waitArgs(
    admin,
    () =>
      document
        .querySelector("[role=dialog]")
        ?.textContent.includes("El jugador guardó"),
    "new unit delivered for Trainer",
  );
  await closeDialog("Listo");
  await hurt(false);
  await clickButton(admin, "Panel batalla");
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "Trainer Battle",
      ),
    "Trainer tab ready",
  );
  await clickButton(admin, "Trainer Battle");
  await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
  await clickButton(admin, "Solicitar equipo y preparar Trainer");
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "Iniciar Trainer Battle" && !b.disabled,
      ),
    "Trainer ready",
  );
  await clickButton(admin, "Iniciar Trainer Battle");
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll("button")].some(
        (b) =>
          b.textContent.includes("Full Restore") &&
          b.textContent.includes("1") &&
          !b.disabled,
      ),
    "admin inventory button has one unit",
  );
  await evalArgs(admin, () =>
    [...document.querySelectorAll("button")]
      .find(
        (b) =>
          b.textContent.includes("Full Restore") &&
          b.textContent.includes("1") &&
          !b.disabled,
      )
      .click(),
  );
  await evalArgs(admin, () =>
    document
      .querySelector('button[aria-label="Usar Full restore en clefairy"]')
      .click(),
  );
  await waitArgs(
    playerA,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag.items[
        "full-restore"
      ] === 0,
    "Trainer effect decrements the original player's Bag",
  );
  assert.equal((await shopRepository.get(2)).battleUses.length, 1);
  await cdp.request("Page.reload", {}, admin);
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll("button")].some((b) =>
        b.textContent.startsWith("Rendirse:"),
      ),
    "admin resumes Trainer with used item",
  );
  assert.equal((await shopRepository.get(2)).battleUses.length, 1);
  await evalArgs(admin, () =>
    [...document.querySelectorAll("button")]
      .find((b) => b.textContent.startsWith("Rendirse:"))
      .click(),
  );
  await clickButton(admin, "Confirmar rendición", "[role=dialog]");
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Volver al combate",
      ),
    "final battle summary",
  );
  await clickButton(admin, "Volver al combate", "[role=dialog]");
  await clickButton(admin, "Salir y actualizar Party");
  await waitArgs(
    playerA,
    async () =>
      !(await import("/src/store/store.ts")).store.getState().party.pvpLock,
    "Trainer result applied",
  );
  assert.equal((await shopRepository.get(2)).items["full-restore"], 0);
  console.log(
    "PASS: Full Restore dashboard, native wild turn, stock, storage recovery and inventory-backed automatic Trainer including admin reload.",
  );
}
