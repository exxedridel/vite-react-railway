import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
    await waitArgs(
      playerA,
      () => {
        const button = document.querySelector(
          'button[aria-label="Usar Full Restore en clefairy"]',
        );
        return button && !button.disabled;
      },
      "Full Restore is ready after inventory synchronization",
    );
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
  await evalArgs(playerA, async () => {
    const items = document.querySelector('[data-testid="battle-items"]');
    const moves = [...document.querySelectorAll("details")].find(
      (details) =>
        details
          .querySelector(":scope > summary")
          ?.textContent.trim()
          .toLowerCase() === "battle moves",
    );
    if (
      !items ||
      items
        .querySelector(":scope > summary")
        ?.textContent.trim()
        .toLowerCase() !== "items" ||
      !moves
    )
      throw new Error(
        "Battle moves and Items must have independent accordions",
      );
    if (
      !(moves.compareDocumentPosition(items) & Node.DOCUMENT_POSITION_FOLLOWING)
    )
      throw new Error("Items must follow Battle moves");
    if (items.contains(moves) || moves.contains(items))
      throw new Error("Items and Battle moves cannot be nested");
    items.open = true;
    const arena = document.querySelector(".battle-scene");
    const { BattleMusic } = await import("/src/lib/battleMusic.ts");
    window.__qaItemBattle = {
      arena,
      dialog: arena.closest('[role="dialog"]'),
      music: arena.querySelector(".battle-scene__audio button"),
      closes: 0,
      stops: 0,
      starts: 0,
      MusicClass: BattleMusic,
      audioUnlock: BattleMusic.prototype.unlock,
      audioClose: AudioContext.prototype.close,
      audioStop: AudioBufferSourceNode.prototype.stop,
      audioStart: AudioBufferSourceNode.prototype.start,
    };
    BattleMusic.prototype.unlock = function (...args) {
      window.__qaItemBattle.engine = this;
      return window.__qaItemBattle.audioUnlock.apply(this, args);
    };
    AudioContext.prototype.close = function (...args) {
      window.__qaItemBattle.closes++;
      return window.__qaItemBattle.audioClose.apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args) {
      window.__qaItemBattle.stops++;
      return window.__qaItemBattle.audioStop.apply(this, args);
    };
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.loop) window.__qaItemBattle.starts++;
      return window.__qaItemBattle.audioStart.apply(this, args);
    };
    if (!window.__qaItemBattle.music || !window.__qaItemBattle.dialog)
      throw new Error(
        "Music control and battle dialog must be mounted before using an item",
      );
  });
  const musicUnlockPoint = await evalArgs(playerA, () => {
    const title = window.__qaItemBattle.dialog.querySelector("h2");
    const box = title.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });
  for (const type of ["mousePressed", "mouseReleased"])
    await cdp.request(
      "Input.dispatchMouseEvent",
      { type, ...musicUnlockPoint, button: "left", clickCount: 1 },
      playerA,
    );
  await waitArgs(
    playerA,
    () => {
      const saved = window.__qaItemBattle;
      return (
        saved.engine?.context?.state === "running" && !!saved.engine.source
      );
    },
    "a trusted pointer gesture starts actual battle music before item use",
  );
  await evalArgs(playerA, () => {
    const saved = window.__qaItemBattle;
    saved.source = saved.engine.source;
    saved.context = saved.engine.context;
    saved.clock = saved.context.currentTime;
    saved.starts = saved.stops = saved.closes = 0;
  });
  const shopService = shopGateway.service;
  const originalUse = shopService.use;
  let releaseUse;
  const blockedUse = new Promise((resolve) => {
    releaseUse = resolve;
  });
  shopService.use = async function (...args) {
    await blockedUse;
    return originalUse.apply(this, args);
  };
  try {
    await evalArgs(playerA, () =>
      document.querySelector('[data-testid="battle-full-restore"]').click(),
    );
    await waitArgs(
      playerA,
      () =>
        !!document.querySelector(
          '[role="alertdialog"][data-testid="item-use-lock"]',
        ),
      "item confirmation is a modal over the mounted battle",
    );
    assert.deepEqual(
      await evalArgs(playerA, () => {
        const saved = window.__qaItemBattle;
        const modal = document.querySelector('[role="alertdialog"]');
        return {
          arena:
            saved.arena.isConnected &&
            document.querySelector(".battle-scene") === saved.arena,
          dialog:
            saved.dialog.isConnected &&
            saved.arena.closest('[role="dialog"]') === saved.dialog,
          music:
            saved.music.isConnected &&
            saved.arena.querySelector(".battle-scene__audio button") ===
              saved.music,
          modal: modal.getAttribute("aria-modal"),
          closes: saved.closes,
          stops: saved.stops,
          playing:
            saved.engine.source === saved.source &&
            saved.engine.context === saved.context &&
            saved.context.state === "running",
          starts: saved.starts,
        };
      }),
      {
        arena: true,
        dialog: true,
        music: true,
        modal: "true",
        closes: 0,
        stops: 0,
        playing: true,
        starts: 0,
      },
    );
    for (const type of ["keyDown", "keyUp"])
      await cdp.request(
        "Input.dispatchKeyEvent",
        {
          type,
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        },
        playerA,
      );
    const point = await evalArgs(playerA, () => {
      const button = document.querySelector(
        'button[aria-label="Cerrar combate y volver al equipo"]',
      );
      const box = button.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    await cdp.request(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", ...point, button: "left", clickCount: 1 },
      playerA,
    );
    await cdp.request(
      "Input.dispatchMouseEvent",
      { type: "mouseReleased", ...point, button: "left", clickCount: 1 },
      playerA,
    );
    assert.equal(
      await evalArgs(
        playerA,
        () =>
          !!document.querySelector(
            '[role="alertdialog"][data-testid="item-use-lock"]',
          ) && window.__qaItemBattle.dialog.isConnected,
      ),
      true,
      "Escape and outside click cannot dismiss the pending operation or close the battle",
    );
    assert.equal(
      (await shopRepository.get(2)).items["full-restore"],
      2,
      "held confirmation has not consumed stock yet",
    );
    const screenshot = await cdp.request(
      "Page.captureScreenshot",
      { format: "png" },
      playerA,
    );
    const screenshotPath = join(
      tmpdir(),
      `pokemon-item-use-modal-${Date.now()}.png`,
    );
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    console.log(`Item confirmation screenshot: ${screenshotPath}`);
  } finally {
    shopService.use = originalUse;
    releaseUse();
  }
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
  assert.deepEqual(
    await evalArgs(playerA, () => {
      const saved = window.__qaItemBattle;
      const result = {
        arena:
          saved.arena.isConnected &&
          document.querySelector(".battle-scene") === saved.arena,
        dialog: saved.dialog.isConnected,
        music: saved.music.isConnected,
        closes: saved.closes,
        stops: saved.stops,
        playing:
          saved.engine.source === saved.source &&
          saved.engine.context === saved.context &&
          saved.context.state === "running",
        advanced: saved.context.currentTime > saved.clock,
        starts: saved.starts,
        pendingModal: !!document.querySelector(
          '[role="alertdialog"][data-testid="item-use-lock"]',
        ),
      };
      AudioContext.prototype.close = saved.audioClose;
      AudioBufferSourceNode.prototype.stop = saved.audioStop;
      AudioBufferSourceNode.prototype.start = saved.audioStart;
      saved.MusicClass.prototype.unlock = saved.audioUnlock;
      delete window.__qaItemBattle;
      return result;
    }),
    {
      arena: true,
      dialog: true,
      music: true,
      closes: 0,
      stops: 0,
      playing: true,
      advanced: true,
      starts: 0,
      pendingModal: false,
    },
  );
  console.log(
    "PASS: item alertdialog preserves battle, arena and music without stopping or closing audio; Escape/outside interaction stays blocked until confirmation.",
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
    () => !!document.querySelector('[data-testid="trainer-items-a"]'),
    "Trainer Items accordion is ready",
  );
  await evalArgs(admin, () => {
    const items = document.querySelector('[data-testid="trainer-items-a"]');
    if (
      !items ||
      items.querySelector(":scope > summary")?.textContent.trim() !== "Items"
    )
      throw new Error("Trainer Items accordion is missing");
    items.open = true;
  });
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
