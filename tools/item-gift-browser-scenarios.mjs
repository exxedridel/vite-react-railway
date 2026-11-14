import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Real BackOffice/player/Mart UI, isolated identity and Nest repositories only. */
export async function runItemGiftBrowserScenario({
  admin, playerA, cdp, evalArgs, waitArgs, field, clickButton,
  seedPvpTeam, shopRepository, shopService, shopGateway,
}) {
  const origin = await evalArgs(admin, () => location.origin);
  const selector = (id) => `[data-testid="${id}"]`;
  const state = () => evalArgs(playerA, async () => JSON.parse(JSON.stringify(
    (await import("/src/store/store.ts")).store.getState().party,
  )));
  const backendWait = async (condition, label) => {
    const deadline = Date.now() + 20000;
    do {
      if (await condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    } while (Date.now() < deadline);
    throw new Error(`Timeout: ${label}`);
  };
  const route = async (page, path) => {
    await cdp.request("Page.stopLoading", {}, page);
    await cdp.request("Page.navigate", { url: origin + path }, page);
    await waitArgs(page, async (path) => location.pathname === path &&
      !!document.querySelector(path === "/dashboard"
        ? 'a[href="/mensajes-prueba"]' : "main") &&
      (await import("/src/store/accountStorage.ts")).getActiveAccountId() !== null,
    `gift route and account ready: ${path}`, path);
  };
  const encounter = async (active) => evalArgs(playerA, async (active) => {
    const [{ transactPvpParty }, storage, field] = await Promise.all([
      import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
      import("/src/lib/battleField.ts"),
    ]);
    await transactPvpParty(2, async (current) => {
      if (current.shopLock || current.pvpLock || current.resetLock ||
        current.itemUseLock || current.centerLock || current.captureAttempt)
        throw new Error("Gift fixture must preserve pending operations");
      const party = JSON.parse(JSON.stringify(current));
      for (const pokemon of party.pokemons)
        for (const move of pokemon.moves ?? []) move.currentPp ??= move.pp;
      party.opponent = active ? {
        kind: "trainer", encounterId: "gift-browser-busy",
        pokemon: JSON.parse(JSON.stringify(party.pokemons[0].pokemon)),
        moves: party.pokemons[0].moves, statuses: [], statusTurns: {}, stages: {},
      } : null;
      party.emerald = undefined; party.lastEmeraldBatch = undefined;
      party.battleField = field.emptyBattleField();
      party.pvpRevision = storage.pvpPartyRevision(current) + 1;
      return { party, value: undefined };
    });
  }, active);
  const openBackOffice = async () => {
    await route(admin, "/back-office");
    await waitArgs(admin, () => !!document.querySelector('[data-testid="gift-player"]'),
      "BackOffice gift controls mounted");
  };
  const choose = async (itemId, quantity) => {
    await waitArgs(admin, () => !document.querySelector('[role="dialog"], [role="alertdialog"]'),
      "gift form is no longer covered by a closing dialog");
    await waitArgs(admin, () => {
      const player = document.querySelector('[data-testid="gift-player"]');
      const option = player?.querySelector('option[value="2"]');
      return player && !player.disabled && option && !option.disabled;
    }, "online current player supports direct item gifts");
    await field(admin, selector("gift-player"), "2");
    await field(admin, selector("gift-item"), itemId);
    await field(admin, selector("gift-quantity"), String(quantity));
    await waitArgs(admin, () => {
      const b = document.querySelector('[data-testid="gift-open"]');
      return b && !b.disabled;
    }, "gift draft is valid and player is free");
  };
  const openGift = async (itemId, quantity) => {
    await choose(itemId, quantity);
    await evalArgs(admin, () => document.querySelector('[data-testid="gift-open"]').click());
    await waitArgs(admin, () => !!document.querySelector('[data-testid="gift-confirm"]'),
      "gift confirmation dialog");
  };
  const confirmTwice = () => evalArgs(admin, () => {
    const b = document.querySelector('[data-testid="gift-confirm"]');
    if (!b || b.disabled) throw new Error("Gift cannot be confirmed");
    b.click(); b.click();
  });
  const giftReceipts = (row) => row.purchases.filter(
    (p) => p.kind === "gift" && p.status === "applied",
  );
  const savedGift = async (itemId, count) => {
    await waitArgs(playerA, async (itemId, count) => {
      const [{ store }, storage] = await Promise.all([
        import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
      ]);
      const p = store.getState().party;
      return storage.getActiveAccountId() === 2 && !p.shopLock &&
        p.bag.items[itemId] === count;
    }, "gift quantity saved in the original player's Bag", itemId, count);
    await waitArgs(admin, () => [...document.querySelectorAll('[role="dialog"]')].some(
      (d) => d.textContent.includes("El jugador guardó el regalo.") &&
        [...d.querySelectorAll("button")].some((b) => b.textContent.trim() === "Listo" && !b.disabled),
    ), "admin receives exact applied gift receipt");
    await clickButton(admin, "Listo", '[role="dialog"]');
    await waitArgs(admin, (count) => document.querySelector('[data-testid="gift-stock"]')
      ?.textContent.trim() === String(count), "BackOffice displays live item count", count);
  };
  const assertSameEconomy = async (baseline) => {
    const row = await shopRepository.get(2);
    assert.equal(row.balance, baseline.balance, "gift preserves canonical Pokedollars");
    assert.equal((await state()).bag.money, baseline.balance, "gift preserves local Pokedollars");
    assert.equal(await evalArgs(admin, () => document.querySelector(
      '[data-testid="gift-balance"]',
    )?.textContent.replace(/[^0-9]/g, "")), String(baseline.balance),
    "BackOffice shows the unchanged Pokedollars balance");
    assert.deepEqual(await shopService.catalog.snapshot(), baseline.catalog,
      "gifts never change global prices, difficulty, mode or catalog revision");
  };
  const replay = async (receipt) => {
    const administrator = [...shopService.actors.values()]
      .filter((actor) => actor.user.id === 1).at(-1);
    const before = await shopRepository.get(2);
    await shopService.gift(administrator, {
      requestId: receipt.requestId, playerUserId: 2, clientId: receipt.clientId,
      itemId: receipt.itemId, quantity: receipt.quantity,
      expectedWalletRevision: receipt.walletRevision - 1,
    });
    assert.deepEqual(await shopRepository.get(2), before,
      "gift replay preserves revision, receipt, stock and Pokedollars exactly");
    await shopGateway.publish();
  };

  await route(playerA, "/dashboard");
  await seedPvpTeam(playerA, 1, 45, 1.3);
  await encounter(false);
  const catalog = await shopService.catalog.snapshot();
  const price = catalog.prices["poke-ball"];
  assert.ok(price > 0, "paid-purchase regression starts from a nonzero existing price");
  const initial = await shopRepository.get(2), previous = initial.storageRevision;
  initial.balance = Math.max(initial.balance, price + 100);
  initial.revision++; initial.storageRevision++;
  assert.equal(await shopRepository.compareAndSwap(initial, previous), true);
  await shopGateway.publish();
  await waitArgs(playerA, async (revision) =>
    (await import("/src/store/store.ts")).store.getState().party.bag.walletRevision === revision,
  "canonical gift test wallet ready", initial.revision);
  const baseline = { balance: initial.balance, catalog };
  const team = (await state()).pokemons;
  const initialBalls = initial.items["poke-ball"] ?? 0;
  const initialTms = initial.items.tm ?? 0;
  const initialGiftCount = giftReceipts(initial).length;
  await openBackOffice();
  await choose("poke-ball", 3);
  for (const invalid of [0, 100]) {
    await field(admin, selector("gift-quantity"), String(invalid));
    assert.equal(await evalArgs(admin, () => document.querySelector(
      '[data-testid="gift-open"]',
    ).disabled), true, "gift quantity must stay within 1..99");
  }
  await openGift("poke-ball", 3);
  await clickButton(admin, "Cancelar", '[role="dialog"]');
  let row = await shopRepository.get(2);
  assert.equal(giftReceipts(row).length, initialGiftCount, "cancel creates no delivered gift");
  assert.deepEqual(row.items, initial.items, "cancel adds no item");
  await assertSameEconomy(baseline);
  await openGift("poke-ball", 3);
  await confirmTwice();
  await savedGift("poke-ball", initialBalls + 3);
  row = await shopRepository.get(2);
  assert.equal(giftReceipts(row).length, initialGiftCount + 1);
  const firstGift = giftReceipts(row).at(-1);
  assert.equal(firstGift.quantity, 3);
  assert.equal(firstGift.unitPrice, 0);
  assert.equal(firstGift.total, 0);
  assert.equal(firstGift.balanceBefore, firstGift.balanceAfter);
  await replay(firstGift);
  await assertSameEconomy(baseline);
  await evalArgs(playerA, () => document.querySelector('button[aria-label="Abrir Bag"]').click());
  await waitArgs(playerA, (count) => document.querySelector(
    '[role="dialog"] [data-item-id="poke-ball"] strong',
  )?.textContent === `×${count}`, "player Bag renders gifted stock automatically", initialBalls + 3);
  await clickButton(playerA, "Close", '[role="dialog"]');
  assert.deepEqual((await state()).pokemons, team, "gift preserves the entire Party/HP/PP");
  console.log("PASS: BackOffice gifts select online player/item/quantity, cancel safely, deliver once on double click/replay, and update both Bag and BackOffice without changing prices or Pokedollars.");

  await encounter(true);
  await waitArgs(admin, () => document.querySelector('[data-testid="gift-open"]')?.disabled &&
    document.querySelector('[data-testid="back-office-player-2"]')?.textContent.includes("En batalla"),
  "active battle disables gifts");
  const battleRow = await shopRepository.get(2);
  await encounter(false);
  await openGift("poke-ball", 1);
  await cdp.request("Network.enable", {}, playerA);
  await cdp.request("Network.emulateNetworkConditions", {
    offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  }, playerA);
  try {
    await cdp.request("Page.reload", {}, playerA);
    await waitArgs(admin, () => {
      const b = document.querySelector('[data-testid="gift-confirm"]');
      return !b || b.disabled;
    }, "offline player cannot confirm a new gift");
    await clickButton(admin, "Cancelar", '[role="dialog"]');
    row = await shopRepository.get(2);
    assert.equal(giftReceipts(row).length, giftReceipts(battleRow).length);
    assert.deepEqual(row.items, battleRow.items, "battle/offline attempts add no items");
  } finally {
    await cdp.request("Network.emulateNetworkConditions", {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    }, playerA);
    await route(playerA, "/dashboard");
  }
  await openGift("tm", 2);
  await evalArgs(playerA, (count) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "persist:root:user:2") {
        const p = JSON.parse(JSON.parse(value).party);
        if (p.shopLock?.operation === "gift" && (p.bag.items.tm ?? 0) > count) {
          window.__qaGiftSaveFailed = true;
          throw new Error("QA interrupted gift checked-save");
        }
      }
      return original.call(this, key, value);
    };
  }, initialTms);
  await confirmTwice();
  await waitArgs(playerA, () => window.__qaGiftSaveFailed,
    "gift final checked-write intentionally interrupted");
  await backendWait(async () => (await shopRepository.get(2)).purchases.some(
    (p) => p.kind === "gift" && p.itemId === "tm" && p.status === "pending",
  ), "gift remains a durable pending receipt");
  await waitArgs(admin, () => document.querySelector('[data-testid="pending-gifts"]')
    ?.textContent.includes("Esperando"), "BackOffice exposes the pending gift");
  await cdp.request("Page.reload", {}, playerA);
  await savedGift("tm", initialTms + 2);
  row = await shopRepository.get(2);
  assert.equal(giftReceipts(row).length, initialGiftCount + 2);
  const recoveredGift = giftReceipts(row).at(-1);
  await replay(recoveredGift);
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(playerA, async (revision, count) => {
    const [{ store }, storage] = await Promise.all([
      import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
    ]);
    const p = store.getState().party;
    return storage.getActiveAccountId() === 2 && !p.shopLock &&
      p.bag.walletRevision === revision && p.bag.items.tm === count;
  }, "terminal gift remains saved through a second reload", row.revision, initialTms + 2);
  await assertSameEconomy(baseline);
  assert.deepEqual((await state()).pokemons, team);
  console.log("PASS: gifts are blocked during battle/offline; pending checked-save recovers once after reload and replay preserves stock, Party, PP, Pokedollars and catalog.");

  await route(admin, "/dashboard");
  await clickButton(admin, "Tienda");
  await waitArgs(admin, () => {
    const b = document.querySelector('[data-testid="shop-player-2"] button[aria-pressed]');
    return b && !b.disabled;
  }, "gift recipient is available for a later real purchase");
  await evalArgs(admin, () => document.querySelector(
    '[data-testid="shop-player-2"] button[aria-pressed]',
  ).click());
  await waitArgs(admin, () => {
    const b = document.querySelector('button[aria-label="Comprar Poké Ball"]');
    return b && !b.disabled;
  }, "normal Mart item keeps its original paid price");
  await evalArgs(admin, () => document.querySelector('button[aria-label="Comprar Poké Ball"]').click());
  await waitArgs(admin, () => !!document.querySelector('input[aria-label="Cantidad de objetos"]'),
    "normal paid purchase dialog");
  await field(admin, 'input[aria-label="Cantidad de objetos"]', "1");
  const beforePurchase = await shopRepository.get(2);
  await clickButton(admin, "Aceptar compra", '[role="dialog"]');
  await waitArgs(admin, () => [...document.querySelectorAll('[role="dialog"]')].some(
    (d) => d.textContent.includes("El jugador guardó") &&
      [...d.querySelectorAll("button")].some((b) => b.textContent.trim() === "Listo" && !b.disabled),
  ), "later paid purchase is delivered normally");
  await clickButton(admin, "Listo", '[role="dialog"]');
  row = await shopRepository.get(2);
  assert.equal(row.balance, beforePurchase.balance - price);
  assert.equal(row.items["poke-ball"], initialBalls + 4);
  assert.equal(row.purchases.at(-1).unitPrice, price);
  assert.equal(row.purchases.at(-1).total, price);
  assert.equal(row.purchases.at(-1).kind, undefined, "regular purchase preserves legacy receipt shape");
  assert.deepEqual(await shopService.catalog.snapshot(), catalog);
  await openBackOffice();
  await choose("poke-ball", 1);
  await cdp.request("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 960, deviceScaleFactor: 1, mobile: false,
  }, admin);
  await evalArgs(admin, () => document.querySelector('[data-testid="back-office-gifts"]')
    .scrollIntoView({ block: "center", behavior: "instant" }));
  await waitArgs(admin, () => {
    const box = document.querySelector('[data-testid="gift-player"]').getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight;
  }, "gift form has reached the viewport before desktop capture");
  await cdp.request("Page.getLayoutMetrics", {}, admin);
  await evalArgs(admin, () => new Promise((resolve) => requestAnimationFrame(
    () => requestAnimationFrame(resolve),
  )));
  const shot = await cdp.request("Page.captureScreenshot", { format: "png" }, admin);
  const shotPath = join(tmpdir(), "pokemon-back-office-item-gifts.png");
  await writeFile(shotPath, Buffer.from(shot.data, "base64"));
  console.log(`BackOffice gift visual QA desktop: ${shotPath}`);
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
  console.log("PASS: a real Poké Mart purchase after gifts still charges the unchanged original price and uses the regular purchase flow.");
}
