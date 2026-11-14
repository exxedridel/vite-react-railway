import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Real BackOffice/player UI against the isolated identity, Nest and Chrome harness. */
export async function runOpponentAutoBrowserScenario({
  admin, playerA, cdp, evalArgs, waitArgs, field, clickButton,
  seedPvpTeam, shopRepository, shopGateway,
}) {
  const state = () => evalArgs(playerA, async () => JSON.parse(JSON.stringify(
    (await import("/src/store/store.ts")).store.getState().party,
  )));
  const route = async (page, path) => {
    const origin = await evalArgs(page, () => location.origin);
    await cdp.request("Page.stopLoading", {}, page);
    await cdp.request("Page.navigate", { url: origin + path }, page);
    await waitArgs(page, async (path) => location.pathname === path &&
      (path !== "/dashboard" || !!document.querySelector('a[href="/mensajes-prueba"]')) &&
      (await import("/src/store/accountStorage.ts")).getActiveAccountId() !== null,
    `automation ${path} and account ready`, path);
  };
  const openBackOffice = async () => {
    await route(admin, "/back-office");
    await waitArgs(admin, () => !!document.querySelector(
      '[role="switch"][aria-label="Rivales automáticos"]',
    ), "BackOffice rival mode control mounted");
  };
  const setAutomatic = async (enabled) => {
    await openBackOffice();
    const checked = await evalArgs(admin, () => document.querySelector(
      '[role="switch"][aria-label="Rivales automáticos"]',
    ).checked);
    if (checked !== enabled) {
      await evalArgs(admin, () => document.querySelector(
        '[role="switch"][aria-label="Rivales automáticos"]',
      ).click());
      await waitArgs(admin, () => {
        const b = document.querySelector('[data-testid="opponent-automation-save"]');
        return b && !b.disabled;
      }, "rival mode can be saved");
      await evalArgs(admin, () => document.querySelector(
        '[data-testid="opponent-automation-save"]',
      ).click());
      await waitArgs(admin, () => !!document.querySelector(
        '[data-testid="opponent-automation-saved"]',
      ), "rival mode saved through admin UI");
    }
    await cdp.request("Page.reload", {}, admin);
    await waitArgs(admin, (enabled) => {
      const control = document.querySelector(
        '[role="switch"][aria-label="Rivales automáticos"]',
      );
      return control && control.checked === enabled;
    }, "global rival mode survives admin reload", enabled);
  };
  const openBattle = async () => {
    await route(playerA, "/dashboard");
    await waitArgs(playerA, () => !!document.querySelector(
      'button[aria-label="Abrir combate de clefairy"]',
    ), "player battle trigger ready");
    await evalArgs(playerA, () => document.querySelector(
      'button[aria-label="Abrir combate de clefairy"]',
    ).click());
    await waitArgs(playerA, () => !!document.querySelector(".battle-scene"),
      "player battle arena mounted");
  };
  const closeHighlights = async (required = false) => {
    if (required) await waitArgs(playerA, () => [...document.querySelectorAll("button")]
      .some((b) => b.textContent.trim() === "Volver al combate"),
    "completed normal turn presents its highlights after wallet reconciliation");
    // Native replacement and paid recovery can legitimately return to the arena
    // directly. Dismiss a presentation dialog when present; assert engine state.
    const deadline = Date.now() + 1200;
    do {
      if (await evalArgs(playerA, () => {
        const b = [...document.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === "Volver al combate",
        );
        if (!b) return false;
        b.click();
        return true;
      })) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (Date.now() < deadline);
  };
  const openTurn = async () => {
    await evalArgs(playerA, () => {
      const b = document.querySelector('button[aria-label^="Turno "]');
      if (!b || b.disabled) throw new Error("Native turn panel unavailable");
      b.click();
    });
    await waitArgs(playerA, () => [...document.querySelectorAll("section")].some(
      (s) => s.querySelector("h3")?.textContent.includes("· Rival"),
    ), "native turn panel ready");
  };
  const chooseSplash = async (automatic = true) => {
    const previousBatchId = (await state()).lastEmeraldBatch?.id ?? null;
    await evalArgs(playerA, () => {
      const details = [...document.querySelectorAll("details")].find(
        (d) => d.querySelector("summary")?.textContent.trim() === "BATTLE MOVES",
      );
      if (!details) throw new Error("No player Battle moves accordion");
      details.open = true;
      const article = [...details.querySelectorAll("article")].find(
        (a) => a.querySelector("h3")?.textContent.trim() === "Splash",
      );
      const b = [...(article?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent.trim() === "Usar movimiento",
      );
      if (!b || b.disabled) throw new Error("Player Splash not available");
      b.click();
    });
    await waitArgs(playerA, () => [...document.querySelectorAll("button")].some(
      (b) => b.textContent.trim() === "Elegir movimiento" && !b.disabled,
    ), "own move confirmation ready");
    await evalArgs(playerA, () => [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Elegir movimiento",
    ).click());
    await waitArgs(playerA, async (automatic, previousBatchId) => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      if (!p.lastEmeraldBatch || p.lastEmeraldBatch.id === previousBatchId) return false;
      return automatic
        ? (p.lastEmeraldBatch?.completed || p.emerald?.requests.player.forceSwitch) &&
          !p.emerald?.pending.player &&
          !p.emerald?.pending.opponent
        : p.emerald?.pending.player?.kind === "move" &&
          !p.lastEmeraldBatch?.completed;
    }, automatic ? "one player decision resolves both native actions"
      : "manual encounter still awaits separate rival input", automatic, previousBatchId);
  };
  const fixture = async (name, { kind = "wild", automatic = true, hp = 45 } = {}) =>
    evalArgs(playerA, async (name, kind, automatic, hp) => {
      const [{ transactPvpParty }, storage, field] = await Promise.all([
        import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
        import("/src/lib/battleField.ts"),
      ]);
      await transactPvpParty(2, async (current) => {
        if (current.captureAttempt || current.itemUseLock || current.centerLock ||
          current.shopLock || current.resetLock || current.pvpLock)
          throw new Error("Automation fixture cannot discard pending operations");
        const party = JSON.parse(JSON.stringify(current));
        party.pokemons.forEach((p, i) => {
          p.pokemon.stats.find((s) => s.name === "hp").value = i === 0 ? hp : 45;
          p.statuses = []; p.statusTurns = {}; p.pokemon.battleStages = {};
          p.moves[0].currentPp = 17;
        });
        const own = party.pokemons[0];
        const pokemon = JSON.parse(JSON.stringify(own.pokemon));
        pokemon.stats.find((s) => s.name === "hp").value = 45;
        party.opponent = { kind, encounterId: name, pokemon,
          automation: { enabled: automatic, catalogRevision: 1 },
          moves: [{ id: 129, name: "swift", displayName: "Swift", type: "normal",
            damageClass: "special", power: 60, accuracy: null, pp: 20,
            currentPp: 12, priority: 0, description: "Automation QA", source: "wild" }],
          statuses: [], statusTurns: {}, stages: {},
        };
        party.battleField = field.emptyBattleField();
        party.emerald = undefined; party.lastEmeraldBatch = undefined;
        party.lastMovesByPlayer = {}; party.lastOpponentMove = null;
        party.starterClaimed = true;
        party.pvpRevision = storage.pvpPartyRevision(current) + 1;
        return { party, value: undefined };
      });
    }, name, kind, automatic, hp);
  const seedHealthy = async () => {
    await route(playerA, "/dashboard");
    await seedPvpTeam(playerA, 2, 45, 2);
    await fixture("qa-mode-setup", { automatic: false });
    // A clean team, not a fixture-generated encounter, is used for real creation.
    await evalArgs(playerA, async () => {
      const { transactPvpParty } = await import("/src/store/store.ts");
      await transactPvpParty(2, async (current) => ({
        party: { ...current, opponent: null, pvpRevision: current.pvpRevision + 1 },
        value: undefined,
      }));
    });
  };
  const installPokeFixture = async () => evalArgs(playerA, () => {
    const original = window.fetch;
    const api = "https://pokeapi.co/api/v2/";
    const pokemon = { id: 35, name: "clefairy", sprites: { front_default: null,
      other: { "official-artwork": { front_default: null } } },
      types: [{ slot: 1, type: { name: "normal" } }],
      stats: ["hp", "attack", "defense", "special-attack", "special-defense", "speed"]
        .map((name) => ({ base_stat: 50, stat: { name } })),
      moves: [{ id: 33, name: "tackle" }, { id: 150, name: "splash" }].map((m) => ({
        move: { name: m.name, url: api + "move/" + m.id + "/" },
        version_group_details: [{ version_group: { name: "emerald" },
          move_learn_method: { name: "level-up" }, level_learned_at: 1 }],
      })),
    };
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : input.url;
      let data;
      if (/^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(35|clefairy)\/?$/.test(url))
        data = pokemon;
      const match = /^https:\/\/pokeapi\.co\/api\/v2\/move\/(33|150)\/?$/.exec(url);
      if (match) {
        const id = Number(match[1]), attack = id === 33;
        data = { id, name: attack ? "tackle" : "splash",
          names: [{ name: attack ? "Tackle" : "Splash", language: { name: "en" } }],
          generation: { name: "generation-i" }, type: { name: "normal" },
          damage_class: { name: attack ? "physical" : "status" },
          power: attack ? 35 : null, accuracy: attack ? 95 : null,
          pp: attack ? 35 : 40, priority: 0, effect_chance: null,
          effect_entries: [{ short_effect: "Local QA move", language: { name: "en" } }],
          flavor_text_entries: [{ flavor_text: "Local QA move", language: { name: "en" },
            version_group: { name: "emerald" } }],
        };
      }
      if (!data) return original.call(this, input, init);
      const response = () => new Response(JSON.stringify(data), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
      if (match && window.__qaAutomationHoldMoves) {
        window.__qaAutomationMoveReleases ??= [];
        return new Promise((resolve) => window.__qaAutomationMoveReleases.push(
          () => resolve(response()),
        ));
      }
      return Promise.resolve(response());
    };
  });
  const createThroughUi = async (kind, expected, duringGeneration, holdWallet = false) => {
    await openBattle();
    await installPokeFixture();
    await evalArgs(playerA, () => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => ["Oponente", "Elegir oponente"].includes(b.textContent.trim()),
      );
      if (!b || b.disabled) throw new Error("Encounter management unavailable");
      b.click();
    });
    await evalArgs(playerA, () => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => ["Seleccionar oponente", "Cambiar oponente"].includes(b.textContent.trim()),
      );
      if (!b || b.disabled) throw new Error("Cannot prepare new opponent");
      b.click();
    });
    await waitArgs(playerA, () => !!document.querySelector('select[aria-label="Tipo de rival"]'),
      "new encounter rival kind selector");
    await field(playerA, 'select[aria-label="Tipo de rival"]', kind);
    await evalArgs(playerA, () => document.querySelector(
      'input[name="encounter-kind"][value="custom"]',
    ).click());
    await field(playerA, "#opponent-search", "35");
    await evalArgs(playerA, () => document.querySelector(
      'button[aria-label="Buscar oponente"]',
    ).click());
    await waitArgs(playerA, () => !!document.querySelector("#candidate-level"),
      "real UI loads deterministic local PokeAPI candidate");
    await field(playerA, "#candidate-level", "5");
    if (holdWallet) {
      await evalArgs(playerA, async () => {
        const { transactPvpParty } = await import("/src/store/store.ts");
        const gate = new Promise((resolve) => { window.__qaWalletRelease = resolve; });
        window.__qaWalletEntered = false;
        window.__qaWalletTransaction = transactPvpParty(2, async (party) => {
          window.__qaWalletEntered = true;
          await gate;
          return { party, value: undefined };
        });
      });
      await waitArgs(playerA, async () => window.__qaWalletEntered &&
        (await import("/src/store/accountStorage.ts")).isAccountTransactionBlocked(),
      "wallet reconciliation holds the ordinary party-write guard");
    }
    if (duringGeneration)
      await evalArgs(playerA, () => { window.__qaAutomationHoldMoves = true; });
    await evalArgs(playerA, () => [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "Iniciar encuentro",
    ).click());
    if (holdWallet) {
      await waitArgs(playerA, () => [...document.querySelectorAll('[role="dialog"]')]
        .some((d) => d.textContent.includes("Consultando movimientos: 2/2")),
      "creation remains visible while its checked save waits behind wallet transaction");
      assert.equal((await state()).opponent, null,
        "creation never claims success while wallet reconciliation still holds the guard");
      await evalArgs(playerA, async () => {
        window.__qaWalletRelease();
        await window.__qaWalletTransaction;
        delete window.__qaWalletRelease;
        delete window.__qaWalletTransaction;
      });
    }
    if (duringGeneration) {
      await waitArgs(playerA, () => window.__qaAutomationMoveReleases?.length > 0,
        "new encounter is awaiting its asynchronous moves");
      await duringGeneration();
      await evalArgs(playerA, () => {
        window.__qaAutomationHoldMoves = false;
        for (const release of window.__qaAutomationMoveReleases ?? []) release();
        delete window.__qaAutomationMoveReleases;
      });
    }
    await waitArgs(playerA, async (kind, expected) => {
      const p = (await import("/src/store/store.ts")).store.getState().party;
      return p.opponent?.kind === kind && p.opponent?.automation?.enabled === expected &&
        Number.isSafeInteger(p.opponent?.automation?.catalogRevision) &&
        p.opponent.moves?.length === 2;
    }, "actual encounter creation stamps current global mode", kind, expected);
    const result = await state();
    assert.equal(result.opponent.automation.enabled, expected);
    assert.equal(result.opponent.kind, kind);
    return result;
  };
  const pp = (p) => p.opponent.moves.reduce((sum, m) => sum + (m.currentPp ?? m.pp), 0);
  const assertManualInputRejected = async () => {
    const before = await state();
    assert.equal(await evalArgs(playerA, async () => {
      const [{ store }, commands] = await Promise.all([
        import("/src/store/store.ts"), import("/src/lib/emerald/commands.ts"),
      ]);
      try {
        await store.dispatch(commands.submitEmeraldAction(
          store.getState().party.pokemons[0].captureId,
          "opponent", { kind: "move", moveId: store.getState().party.opponent.moves[0].id },
        ));
        return false;
      } catch (e) { return e.message.includes("automáticamente"); }
    }), true, "raw rival command is rejected in automatic mode");
    assert.deepEqual(await state(), before, "rejected rival input mutates no battle state");
  };
  const fixtureWallet = async () => {
    const row = await shopRepository.get(2), previous = row.storageRevision;
    row.items = { ...row.items, "full-restore": 3, "max-ether": 3 };
    row.revision++; row.storageRevision++;
    assert.equal(await shopRepository.compareAndSwap(row, previous), true);
    await shopGateway.publish();
    await waitArgs(playerA, async (revision) =>
      (await import("/src/store/store.ts")).store.getState().party.bag.walletRevision === revision,
    "automatic battle item stock synchronized", row.revision);
  };
  const useItemUi = async (item) => {
    await evalArgs(playerA, () => {
      document.querySelector('[data-testid="battle-items"]').open = true;
    });
    if (item === "max-ether")
      await field(playerA, 'select[aria-label="Movimiento para Max Ether"]', "150");
    await waitArgs(playerA, (item) => {
      const b = document.querySelector(`[data-testid="battle-${item}"]`);
      return b && !b.disabled;
    }, "paid item is available for player's action", item);
    await evalArgs(playerA, (item) => document.querySelector(
      `[data-testid="battle-${item}"]`,
    ).click(), item);
  };

  await setAutomatic(false);
  await seedHealthy();
  const manual = await createThroughUi("wild", false, undefined, true);
  await setAutomatic(true);
  assert.deepEqual((await state()).opponent.automation, manual.opponent.automation,
    "enabling global automation preserves active manual encounter");
  await openBattle();
  assert.equal((await state()).opponent.automation.enabled, false,
    "active manual encounter remains manual after reload");
  await chooseSplash(false);
  assert.equal(pp(await state()), pp(manual),
    "global on never auto-acts in an existing manual encounter");
  await evalArgs(playerA, async () => {
    const [{ store }, commands] = await Promise.all([
      import("/src/store/store.ts"), import("/src/lib/emerald/commands.ts"),
    ]);
    await store.dispatch(commands.submitEmeraldAction(
      store.getState().party.pokemons[0].captureId,
      "opponent", { kind: "move", moveId: 150 },
    ));
  });
  await closeHighlights(true);
  await setAutomatic(false);
  const automatic = await createThroughUi("wild", true, async () => {
    await setAutomatic(true);
    await waitArgs(playerA, () => [...document.querySelectorAll('[role="dialog"]')]
      .some((d) => d.textContent.includes("movimientos rivales automáticos")),
    "new global mode reaches player before asynchronous generation finishes");
  });
  await openBattle();
  await assertManualInputRejected();
  await chooseSplash();
  let after = await state();
  assert.equal(pp(after), pp(automatic) - 1, "wild automatic rival spends PP exactly once");
  assert.equal(after.pokemons[0].moves[0].currentPp,
    automatic.pokemons[0].moves[0].currentPp - 1,
    "player spends exactly one PP for its decision");
  if (after.lastEmeraldBatch?.completed) await closeHighlights(true);
  await openTurn();
  assert.equal(await evalArgs(playerA, () => {
    const rival = [...document.querySelectorAll("section")].find(
      (s) => s.querySelector("h3")?.textContent.includes("· Rival"),
    );
    return !!rival && rival.querySelectorAll("button").length === 0;
  }), true, "automatic rival turn panel exposes no manual action buttons");
  await setAutomatic(false);
  await openBattle();
  assert.equal((await state()).opponent.automation.enabled, true,
    "active automatic mode survives global off and player reload");
  await chooseSplash();
  after = await state();
  assert.equal(pp(after), pp(automatic) - 2, "frozen auto encounter still responds once");
  await closeHighlights(true);
  await createThroughUi("trainer", false);
  await setAutomatic(true);
  const trainer = await createThroughUi("trainer", true);
  await openBattle();
  await chooseSplash();
  after = await state();
  assert.equal(pp(after), pp(trainer) - 1, "new automatic trainer resolves rival response");
  await closeHighlights(true);
  console.log("PASS: BackOffice on/off persistence, real wild/trainer UI creation, frozen encounter mode, own-only actions and one rival response/PP per turn.");

  await fixture("qa-automatic-switch");
  await openBattle();
  await openTurn();
  await clickButton(playerA, "Cambiar a clefairy");
  await waitArgs(playerA, async () => {
    const p = (await import("/src/store/store.ts")).store.getState().party;
    return p.battleField.activeCaptureId === p.pokemons[1].captureId &&
      p.opponent.moves[0].currentPp === 11 && p.lastEmeraldBatch?.completed;
  }, "voluntary switch causes exactly one automatic response");
  await route(playerA, "/dashboard");
  await fixture("qa-automatic-knockout", { hp: 1 });
  await openBattle();
  await chooseSplash();
  after = await state();
  assert.equal(after.emerald.requests.player.forceSwitch, true);
  const knockoutPp = pp(after), replacementHp = after.pokemons[1].pokemon.stats
    .find((s) => s.name === "hp").value;
  if (after.lastEmeraldBatch?.completed) await closeHighlights();
  await openTurn();
  await clickButton(playerA, "Cambiar a clefairy");
  await waitArgs(playerA, async () => {
    const p = (await import("/src/store/store.ts")).store.getState().party;
    return p.battleField.activeCaptureId === p.pokemons[1].captureId &&
      !p.emerald.requests.player.forceSwitch;
  }, "KO replacement completed");
  after = await state();
  assert.equal(pp(after), knockoutPp, "KO replacement gives no extra rival attack or PP spend");
  assert.equal(after.pokemons[1].pokemon.stats.find((s) => s.name === "hp").value,
    replacementHp, "KO replacement receives no extra rival attack");
  console.log("PASS: voluntary switching consumes one response; KO replacement consumes no extra rival action.");

  await route(playerA, "/dashboard");
  await fixture("qa-automatic-items");
  await fixtureWallet();
  await openBattle();
  const beforeItems = await shopRepository.get(2);
  await useItemUi("full-restore");
  await waitArgs(playerA, async () => {
    const p = (await import("/src/store/store.ts")).store.getState().party;
    return !p.itemUseLock && p.bag.items["full-restore"] === 2 &&
      p.opponent.moves[0].currentPp === 11 && p.lastEmeraldBatch?.completed;
  }, "Full Restore atomically consumes item/action and one automatic response");
  after = await state();
  assert.equal(after.pokemons[0].moves[0].currentPp, 17,
    "item action spends no player move PP");
  await closeHighlights();
  // Fail only the final checked application, after the durable paid plan exists.
  await evalArgs(playerA, () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "persist:root:user:2") {
        const p = JSON.parse(JSON.parse(value).party);
        if (p.itemUseLock?.appliedWalletRevision !== undefined) {
          window.__qaAutomationSaveFailed = true;
          throw new Error("QA automatic item checked-save failure");
        }
      }
      return original.call(this, key, value);
    };
  });
  await useItemUi("max-ether");
  await waitArgs(playerA, () => window.__qaAutomationSaveFailed &&
    !!document.querySelector('[data-testid="item-use-lock"]'),
    "paid automatic turn remains recoverable after checked-save failure");
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(playerA, async () => {
    const p = (await import("/src/store/store.ts")).store.getState().party;
    return !p.itemUseLock && p.bag.items["max-ether"] === 2 &&
      p.pokemons[0].moves[0].currentPp === 40 && p.opponent.moves[0].currentPp === 10;
  }, "reload applies same paid automatic turn exactly once");
  const recovered = await state();
  const finalWallet = await shopRepository.get(2);
  assert.equal(finalWallet.items["full-restore"], 2, "Full Restore debit occurs once");
  assert.equal(finalWallet.items["max-ether"], 2, "Max Ether debit occurs once after recovery");
  assert.equal(finalWallet.uses.length, beforeItems.uses.length + 2,
    "two paid actions produce exactly two canonical use receipts");
  await cdp.request("Page.reload", {}, playerA);
  await waitArgs(playerA, async (encounterId, revision) => {
    const [{ store }, storage] = await Promise.all([
      import("/src/store/store.ts"), import("/src/store/accountStorage.ts"),
    ]);
    const p = store.getState().party;
    return storage.getActiveAccountId() === 2 && p.opponent?.encounterId === encounterId &&
      p.bag.walletRevision === revision && !p.itemUseLock;
  }, "saved account and recovered automatic item remain terminal",
  recovered.opponent.encounterId, finalWallet.revision);
  after = await state();
  assert.equal(after.battleField.turn, recovered.battleField.turn);
  assert.equal(pp(after), pp(recovered), "reload never replays automatic opponent RNG/action");
  await setAutomatic(false);
  await evalArgs(admin, () => document.getElementById("opponent-automation-heading")
    ?.scrollIntoView({ block: "center" }));
  const screenshot = async (page, name) => {
    await cdp.request("Page.getLayoutMetrics", {}, page);
    await evalArgs(page, () => new Promise((resolve) => requestAnimationFrame(
      () => requestAnimationFrame(resolve),
    )));
    await waitArgs(page, () => [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => d.dataset.state !== "closed")
      .every((d) => Number(getComputedStyle(d).opacity) >= 0.99),
    "dialog entry animation finished before visual capture");
    const result = await cdp.request("Page.captureScreenshot", { format: "png" }, page);
    const path = join(tmpdir(), `pokemon-opponent-automation-${name}.png`);
    await writeFile(path, Buffer.from(result.data, "base64"));
    return path;
  };
  const backOfficeShot = await screenshot(admin, "back-office");
  await openBattle();
  const arenaShot = await screenshot(playerA, "arena-desktop");
  await cdp.request("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: false,
  }, playerA);
  await waitArgs(playerA, () => innerWidth === 390 &&
    document.documentElement.scrollWidth <= innerWidth,
  "narrow automatic arena has no horizontal overflow");
  const narrowShot = await screenshot(playerA, "arena-mobile");
  await cdp.request("Emulation.clearDeviceMetricsOverride", {}, playerA);
  console.log(`Automation screenshots: ${backOfficeShot}; ${arenaShot}; ${narrowShot}`);
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
  console.log("PASS: automatic Full Restore/Max Ether consume stock and turn once; interrupted checked-save recovers without duplicate opponent turn, PP or item debit.");
}
