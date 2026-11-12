import assert from "node:assert/strict";

/** Local Chrome/Nest fixtures only: exercises the same UI and receipts as play. */
export async function ppItemsBrowserScenario({
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
  row.balance = 3000;
  row.revision++;
  row.storageRevision++;
  assert.equal(await shopRepository.compareAndSwap(row, previous), true);
  await shopGateway.publish();
  await waitArgs(
    playerA,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag.money ===
      3000,
    "PP shopping wallet synchronized",
  );
  await seedPvpTeam(playerA, 2, 40, 1.3);
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
    ]);
    await transactPvpParty(2, async (current) => {
      const party = JSON.parse(JSON.stringify(current));
      party.pokemons.forEach((capture) => {
        capture.moves[0].currentPp = 2;
        capture.moves.push({
          id: 33,
          name: "tackle",
          displayName: "Tackle",
          type: "normal",
          damageClass: "physical",
          power: 35,
          accuracy: 95,
          pp: 35,
          currentPp: 1,
          priority: 0,
          description: "Test",
          source: "tm",
        });
      });
      party.pvpRevision = storage.pvpPartyRevision(current) + 1;
      return { party, value: undefined };
    });
  });
  await clickButton(admin, "Tienda");
  for (const [name, item, balance] of [
    ["Max Ether", "max-ether", 2300],
    ["Max Elixir", "max-elixir", 900],
  ]) {
    await select(2);
    await openItem(name);
    await field(admin, 'input[aria-label="Cantidad de objetos"]', "2");
    await clickButton(admin, "Aceptar compra", "[role=dialog]");
    await waitArgs(
      admin,
      () =>
        document
          .querySelector("[role=dialog]")
          ?.textContent.includes("El jugador guardó"),
      `${name} delivered`,
    );
    await closeDialog("Listo");
    const stored = await shopRepository.get(2);
    assert.equal(stored.balance, balance);
    assert.equal(stored.items[item], 2);
    assert.equal(
      stored.purchases.at(-1).unitPrice,
      item === "max-ether" ? 350 : 700,
    );
  }
  async function openActions(index = 0) {
    await waitArgs(
      playerA,
      (index) =>
        document.querySelectorAll('button[aria-label="Acciones de clefairy"]')
          .length > index,
      "PP Party actions available",
      index,
    );
    await evalArgs(
      playerA,
      (index) =>
        document
          .querySelectorAll('button[aria-label="Acciones de clefairy"]')
          [index].click(),
      index,
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="party-max-ether"]'),
      "PP item controls visible",
    );
  }
  async function ready(item) {
    await waitArgs(
      playerA,
      (item) => {
        const button = document.querySelector(`[data-testid="party-${item}"]`);
        return button && !button.disabled;
      },
      `${item} ready`,
      item,
    );
  }
  async function use(item, moveId) {
    if (moveId !== undefined)
      await field(
        playerA,
        'select[aria-label="Movimiento para Max Ether"]',
        String(moveId),
      );
    await ready(item);
    await evalArgs(
      playerA,
      (item) => {
        const button = document.querySelector(`[data-testid="party-${item}"]`);
        button.click();
        button.click();
      },
      item,
    );
    await waitArgs(
      playerA,
      async () => {
        const [{ store }, storage] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
        ]);
        const party = store.getState().party;
        return (
          !document.querySelector('[role="dialog"]') &&
          !party.itemUseLock &&
          !storage.isLocalPartyMutationBlocked(party)
        );
      },
      `${item} applied and acknowledged`,
    );
  }
  await openActions();
  await use("max-ether", 150);
  let party = await evalArgs(playerA, async () =>
    JSON.parse(
      JSON.stringify(
        (await import("/src/store/store.ts")).store.getState().party,
      ),
    ),
  );
  assert.deepEqual(
    party.pokemons[0].moves.map((m) => m.currentPp),
    [40, 1],
  );
  assert.equal(party.bag.items["max-ether"], 1);
  await openActions(1);
  await use("max-elixir");
  party = await evalArgs(playerA, async () =>
    JSON.parse(
      JSON.stringify(
        (await import("/src/store/store.ts")).store.getState().party,
      ),
    ),
  );
  assert.deepEqual(
    party.pokemons[1].moves.map((m) => m.currentPp),
    [40, 35],
  );
  assert.equal(
    party.pokemons[1].pokemon.stats.find((s) => s.name === "hp").value,
    0,
  );
  assert.equal(party.bag.items["max-elixir"], 1);
  await openActions(1);
  assert.equal(
    await evalArgs(
      playerA,
      () => document.querySelector('[data-testid="party-max-elixir"]').disabled,
    ),
    true,
  );
  assert.equal(
    await evalArgs(
      playerA,
      () =>
        document.querySelector(
          'select[aria-label="Movimiento para Max Ether"] option[value="150"]',
        ).disabled,
    ),
    true,
  );
  const usesBefore = (await shopRepository.get(2)).uses.length;
  await evalArgs(playerA, () =>
    document.querySelector('[data-testid="party-max-elixir"]').click(),
  );
  assert.equal((await shopRepository.get(2)).uses.length, usesBefore);
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async () => {
      const party = (await import("/src/store/store.ts")).store.getState()
        .party;
      return (
        party.bag.walletUserId === 2 &&
        party.pokemons[0]?.moves[0].currentPp === 40 &&
        party.pokemons[1]?.moves[1].currentPp === 35
      );
    },
    "dashboard PP/item persistence after reload",
  );
  console.log(
    "PP Chrome: Ether 350/Elixir 700 purchases, specific move/all moves, KO target, double click, no effect and reload passed.",
  );

  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage, fields, stats] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
      import("/src/lib/battleField.ts"),
      import("/src/lib/pokemonStats.ts"),
    ]);
    await transactPvpParty(2, async (current) => {
      const party = JSON.parse(JSON.stringify(current)),
        own = party.pokemons[0];
      own.moves[0].currentPp = 4;
      own.moves[1].currentPp = 0;
      own.statuses = [];
      own.statusTurns = {};
      own.pokemon.stats.find((s) => s.name === "hp").value = stats.getMaxHp(
        own.pokemon,
      );
      party.opponent = {
        kind: "wild",
        encounterId: "pp-wild",
        pokemon: JSON.parse(JSON.stringify(own.pokemon)),
        moves: [{ ...own.moves[0], currentPp: 10 }],
        statuses: [],
        stages: {},
      };
      party.emerald = undefined;
      party.battleField = {
        ...fields.emptyBattleField(),
        activeCaptureId: own.captureId,
      };
      party.pvpRevision = storage.pvpPartyRevision(current) + 1;
      return { party, value: undefined };
    });
    const [{ store }, commands] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/lib/emerald/commands.ts"),
    ]);
    const captureId = store.getState().party.pokemons[0].captureId;
    await store.dispatch(
      commands.submitEmeraldAction(captureId, "player", {
        kind: "move",
        moveId: 150,
      }),
    );
    await store.dispatch(
      commands.submitEmeraldAction(captureId, "opponent", {
        kind: "move",
        moveId: 150,
      }),
    );
  });
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        p.pokemons[0].moves[0].currentPp === 3 &&
        p.opponent.moves[0].currentPp === 9
      );
    },
    "native moves spend one PP per actor",
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async () => {
      const [{ store }, storage] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/store/accountStorage.ts"),
      ]);
      const p = store.getState().party;
      return (
        p.pokemons[0]?.moves[0].currentPp === 3 &&
        !storage.isLocalPartyMutationBlocked(p)
      );
    },
    "native PP persist after reload",
  );
  await waitArgs(
    playerA,
    () =>
      !!document.querySelector(
        'button[aria-label="Abrir combate de clefairy"]',
      ),
    "wild battle button available",
  );
  await evalArgs(playerA, () =>
    document
      .querySelector('button[aria-label="Abrir combate de clefairy"]')
      .click(),
  );
  await waitArgs(
    playerA,
    () => !!document.querySelector('[data-testid="battle-max-ether"]'),
    "wild PP controls visible",
  );
  await evalArgs(playerA, () => {
    document
      .querySelector('[data-testid="battle-max-ether"]')
      .closest("details").open = true;
  });
  await field(playerA, 'select[aria-label="Movimiento para Max Ether"]', "150");
  await waitArgs(
    playerA,
    () => !document.querySelector('[data-testid="battle-max-ether"]').disabled,
    "wild Max Ether enabled",
  );
  await evalArgs(playerA, () =>
    document.querySelector('[data-testid="battle-max-ether"]').click(),
  );
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        !p.itemUseLock &&
        p.bag.items["max-ether"] === 0 &&
        p.emerald?.pending.player?.kind === "item"
      );
    },
    "native Ether occupies the player action and debits one Bag unit",
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
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        p.pokemons[0].moves[0].currentPp === 40 &&
        p.pokemons[0].moves[1].currentPp === 0 &&
        p.opponent.moves[0].currentPp === 8 &&
        !p.emerald.pending.player
      );
    },
    "wild item restored PP and consumed the full player action",
  );
  assert.equal(
    await evalArgs(
      playerA,
      () => document.querySelector('[data-testid="battle-max-ether"]')?.disabled ?? true,
    ),
    true,
  );
  const afterWild = await shopRepository.get(2);
  assert.equal(afterWild.balance, 900);
  assert.equal(afterWild.items["max-ether"], 0);
  assert.equal(afterWild.items["max-elixir"], 1);
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        p.bag.items["max-ether"] === 0 &&
        p.pokemons[0]?.moves[0].currentPp === 40 &&
        p.pokemons[0]?.moves[1].currentPp === 0
      );
    },
    "native restored PP and empty stock survive reload",
  );
  console.log(
    "PASS: PP Chrome native wild spending/persistence, Ether restore, zero-stock guard and paid item turn consumption.",
  );
  await evalArgs(playerA, async () => {
    const [{ transactPvpParty }, storage, stats] = await Promise.all([
      import("/src/store/store.ts"),
      import("/src/store/accountStorage.ts"),
      import("/src/lib/pokemonStats.ts"),
    ]);
    await transactPvpParty(2, async (current) => {
      const party = JSON.parse(JSON.stringify(current));
      party.opponent = null;
      delete party.emerald;
      party.pokemons[0].statuses = [];
      party.pokemons[0].pokemon.stats.find((s) => s.name === "hp").value =
        stats.getMaxHp(party.pokemons[0].pokemon);
      party.pokemons[0].moves[0].currentPp = 2;
      party.pokemons[0].moves[1].currentPp = 0;
      party.pvpRevision = storage.pvpPartyRevision(current) + 1;
      return { party, value: undefined };
    });
  });
  await clickButton(admin, "Panel batalla");
  await clickButton(admin, "Trainer Battle");
  await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
  await clickButton(admin, "Solicitar equipo y preparar Trainer");
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "Iniciar Trainer Battle" && !b.disabled,
      ),
    "PP Trainer ready",
  );
  await clickButton(admin, "Iniciar Trainer Battle");
  await waitArgs(
    admin,
    () =>
      !!document.querySelector('select[aria-label^="Pokémon para objetos PP"]'),
    "PP admin targets visible",
  );
  const captureId = await evalArgs(
    playerA,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.pokemons[0]
        .captureId,
  );
  await field(
    admin,
    'select[aria-label^="Pokémon para objetos PP"]',
    captureId,
  );
  await waitArgs(
    admin,
    () => {
      const b = document.querySelector(
        'button[aria-label^="Usar Max Elixir de "]',
      );
      return b && !b.disabled;
    },
    "admin Max Elixir stock available",
  );
  const priorBattleUses = (await shopRepository.get(2)).battleUses.length;
  await evalArgs(admin, () =>
    document.querySelector('button[aria-label^="Usar Max Elixir de "]').click(),
  );
  await waitArgs(
    playerA,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag.items[
        "max-elixir"
      ] === 0,
    "Trainer Max Elixir debits real Bag",
  );
  const trainerWallet = await shopRepository.get(2);
  assert.equal(trainerWallet.battleUses.length, priorBattleUses + 1);
  assert.equal(trainerWallet.battleUses.at(-1).itemId, "max-elixir");
  await cdp.request("Page.reload", {}, admin);
  await waitArgs(
    admin,
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.startsWith("Rendirse:") && !b.disabled,
      ),
    "PP Trainer checkpoint reload",
  );
  assert.equal(
    (await shopRepository.get(2)).battleUses.length,
    priorBattleUses + 1,
  );
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
    "PP Trainer final summary",
  );
  await clickButton(admin, "Volver al combate", "[role=dialog]");
  await clickButton(admin, "Salir y actualizar Party");
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        !p.pvpLock &&
        p.pokemons[0].moves[0].currentPp === 40 &&
        p.pokemons[0].moves[1].currentPp === 35
      );
    },
    "Trainer final result applies restored PP to original Party",
  );
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(
    playerA,
    async () => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return (
        !p.pvpLock &&
        p.pokemons[0]?.moves[1].currentPp === 35 &&
        p.bag.items["max-elixir"] === 0
      );
    },
    "Trainer PP and spent item survive player reload",
  );
  console.log(
    "PASS: PP Chrome automatic Trainer uses real Elixir stock, resumes admin checkpoint without double debit, and applies persistent PP result to player.",
  );
}
