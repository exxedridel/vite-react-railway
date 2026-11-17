import assert from "node:assert/strict";
import { waitLocalItemFlush } from "./legacy-item-browser-fixture.mjs";

/** Actual Redux/native-engine results and isolated Nest ledgers in real Chrome. */
export async function runBattleRewardsBrowserScenario({
  admin,
  playerA,
  cdp,
  evalArgs,
  waitArgs,
  field,
  clickButton,
  seedPvpTeam,
  partyState,
  frontendUrl,
  backendUrl,
  shopRepository,
  shopService,
  shopGateway,
  pvpRepository,
  pvpGateway,
}) {
  const state = () => partyState(playerA);
  const route = async (page, path = "/dashboard") => {
    await cdp.request("Page.stopLoading", {}, page);
    await cdp.request("Page.navigate", { url: frontendUrl + path }, page);
    await waitArgs(
      page,
      async (path) =>
        location.pathname === path &&
        !!document.querySelector('a[href="/mensajes-prueba"]') &&
        (await import("/src/store/accountStorage.ts")).getActiveAccountId() !==
          null,
      `reward ${path} and saved account loaded`,
      path,
    );
  };
  const until = async (predicate, label) => {
    const deadline = Date.now() + 20000;
    do {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    throw new Error(`Timeout: ${label}`);
  };
  const flushRewards = async () => {
    await waitArgs(
      playerA,
      async () => {
        const p = (await import("/src/store/store.ts")).store.getState().party;
        return !p.localRewardOutbox?.length;
      },
      "combat monetary rewards are acknowledged without blocking the game",
    );
  };
  const noGate = async () =>
    assert.equal(
      await evalArgs(
        playerA,
        () =>
          !!document.querySelector(
            '[data-testid="pvp-party-lock"], [data-testid="item-use-lock"], [data-testid="shop-party-lock"]',
          ),
      ),
      false,
      "a local combat reward does not cover the game with an operation gate",
    );
  const openBattle = async () => {
    await route(playerA);
    await waitArgs(
      playerA,
      () =>
        !!document.querySelector(
          'button[aria-label="Abrir combate de clefairy"]',
        ),
      "reward player battle trigger ready",
    );
    await evalArgs(playerA, () =>
      document
        .querySelector('button[aria-label="Abrir combate de clefairy"]')
        .click(),
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector(".battle-scene"),
      "reward local arena mounted",
    );
  };
  const dismissHighlights = async (page) => {
    const present = await evalArgs(page, () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "Volver al combate",
      ),
    );
    if (present)
      await clickButton(page, "Volver al combate", '[role="dialog"]');
  };
  const fixture = async (name, kind, color, rivalLevel) =>
    evalArgs(
      playerA,
      async (name, kind, color, rivalLevel) => {
        const [
          { store, transactPvpParty },
          storage,
          fields,
          catalog,
          stats,
          encounter,
        ] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
          import("/src/lib/battleField.ts"),
          import("/src/lib/trainerBattle/catalog.ts"),
          import("/src/lib/pokemonStats.ts"),
          import("/src/lib/localEncounter.ts"),
        ]);
        await transactPvpParty(2, async (current) => {
          if (
            current.pvpLock ||
            current.shopLock ||
            current.itemUseLock ||
            current.resetLock ||
            current.centerLock ||
            current.captureAttempt
          )
            throw new Error(
              "Reward fixture cannot replace a reserved operation",
            );
          const party = JSON.parse(JSON.stringify(current));
          const own = party.pokemons[0];
          own.statuses = [];
          own.statusTurns = {};
        own.pokemon.battleStages = stats.neutralBattleStages();
          own.moves = [57, 129, 150].map((id) => ({
            ...catalog.trainerMoves.find((m) => m.id === id),
            source: "tm",
            currentPp: id === 57 ? 10 : 15,
          }));
          own.pokemon.learnset = {
            versionGroup: "emerald",
            moves: own.moves.map((m) => ({ id: m.id, name: m.name })),
          };
          // Fixed superior stats keep a browser integration fixture short; the
          // native battle still computes every hit, PP debit and KO normally.
          own.pokemon.stats.forEach((s) => {
            if (s.name !== "hp") s.value = 500;
          });
          own.pokemon.stats.find((s) => s.name === "hp").value = Math.min(
            40,
            stats.getMaxHp(own.pokemon),
          );
          party.opponent = null;
          party.emerald = undefined;
          party.lastEmeraldBatch = undefined;
          party.lastMovesByPlayer = {};
          party.lastOpponentMove = null;
          party.battleField = {
            ...fields.emptyBattleField(),
            activeCaptureId: own.captureId,
          };
          party.starterClaimed = true;
          party.pvpRevision = storage.pvpPartyRevision(current) + 1;
          return { party, value: undefined };
        });
        const party = store.getState().party;
        const species = catalog.trainerSpecies.find((p) => p.id === 35);
        const pokemon = stats.createLeveledPokemon(
          {
            id: species.id,
            name: species.name,
            image: null,
            types: species.types,
            stats: species.baseStats,
            learnset: {
              versionGroup: "emerald",
              moves: [{ id: 150, name: "splash" }],
            },
          },
          undefined,
          rivalLevel,
        );
        pokemon.stats.find((s) => s.name === "hp").value = 1;
        await store.dispatch(
          encounter.prepareLocalEncounter({
            kind,
            encounterId: name,
            pokemon,
            stages: {},
            statuses: [],
            statusTurns: {},
            automation: { enabled: true, catalogRevision: 0 },
            rewards: { version: 1, color, epoch: party.bag.rewardEpoch ?? 0 },
            moves: [
              {
                ...catalog.trainerMoves.find((m) => m.id === 150),
                source: "wild",
                currentPp: 40,
              },
            ],
          }),
        );
        return party.pokemons[0].captureId;
      },
      name,
      kind,
      color,
      rivalLevel,
    );
  const winLocal = async () => {
    await openBattle();
    const before = await state();
    await evalArgs(playerA, async () => {
      const [{ store }, commands] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/lib/emerald/commands.ts"),
      ]);
      await store.dispatch(
        commands.submitEmeraldAction(
          store.getState().party.pokemons[0].captureId,
          "player",
          { kind: "move", moveId: 129 },
        ),
      );
    });
    await waitArgs(
      playerA,
      async () => {
        const p = (await import("/src/store/store.ts")).store.getState().party;
        return (
          p.emerald?.ended &&
          p.opponent?.pokemon.stats.find((s) => s.name === "hp").value === 0
        );
      },
      "native player victory is durably committed",
    );
    await noGate();
    const after = await state();
    assert.equal(
      after.pokemons[0].moves.find((m) => m.id === 129).currentPp,
      before.pokemons[0].moves.find((m) => m.id === 129).currentPp - 1,
      "level rewards do not replenish the PP spent in the winning move",
    );
    return { before, after };
  };

  await route(playerA);
  await seedPvpTeam(playerA, 1, 40, 1.3);
  const initial = await shopRepository.get(2),
    oldRevision = initial.storageRevision;
  initial.items["great-ball"] = 1;
  initial.revision++;
  initial.storageRevision++;
  assert.equal(await shopRepository.compareAndSwap(initial, oldRevision), true);
  await shopGateway.publish();
  await waitArgs(
    playerA,
    async () =>
      (await import("/src/store/store.ts")).store.getState().party.bag.items[
        "great-ball"
      ] === 1,
    "central ball stock synchronized for capture reward test",
  );
  const startingBalance = (await shopRepository.get(2)).balance;
  const originalClaim = shopService.rewardClaim;
  const claims = [];
  shopService.rewardClaim = async function (actor, payload) {
    const entry = { actor, payload: structuredClone(payload) };
    claims.push(entry);
    return originalClaim.call(this, actor, payload);
  };
  try {
    await fixture("reward-local-pink", "trainer", "pink", 21);
    const first = await winLocal();
    assert.equal(first.before.pokemons[0].pokemon.level, 20);
    assert.equal(first.after.pokemons[0].pokemon.level, 22);
    await flushRewards();
    await until(
      async () =>
        (await shopRepository.get(2)).balance === startingBalance + 200,
      "pink trainer credits exactly 200 Pokedollars centrally",
    );
    const firstSaved = await state();
    const firstLedger = await shopRepository.get(2);
    assert.equal(
      firstLedger.rewards.filter((r) => r.encounterId === "reward-local-pink")
        .length,
      1,
    );
    const firstClaim = claims.find((c) =>
      c.payload.rewards.some((r) => r.encounterId === "reward-local-pink"),
    );
    assert(firstClaim);
    await originalClaim.call(shopService, firstClaim.actor, firstClaim.payload);
    assert.equal((await shopRepository.get(2)).balance, startingBalance + 200);
    assert.equal((await shopRepository.get(2)).revision, firstLedger.revision);
    await route(playerA);
    assert.equal((await state()).pokemons[0].pokemon.level, 22);
    assert.deepEqual((await state()).pokemons, firstSaved.pokemons);
    console.log(
      "PASS: a native pink trainer KO gives two levels, preserves spent PP and credits 200 PD once across reload and replay.",
    );

    await fixture("reward-local-capture", "wild", "pink", 20);
    await openBattle();
    await clickButton(playerA, "Oponente", '[role="dialog"]');
    await waitArgs(
      playerA,
      () => {
        const b = document.querySelector('[data-testid="capture-open"]');
        return b && !b.disabled;
      },
      "capture reward ball inventory is available",
    );
    await evalArgs(playerA, () =>
      document.querySelector('[data-testid="capture-open"]').click(),
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="capture-ball-great-ball"]'),
      "capture reward direct ball picker mounted",
    );
    await evalArgs(playerA, () => {
      window.__qaRewardRandom = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = function (array) {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = 19;
          return array;
        }
        return window.__qaRewardRandom(array);
      };
      const b = document.querySelector(
        '[data-testid="capture-ball-great-ball"]',
      );
      if (!b || b.disabled)
        throw new Error("Capture reward fixture has no ball/valid threshold");
      b.click();
      b.click();
    });
    await waitArgs(
      playerA,
      async () =>
        (await import("/src/store/store.ts")).store.getState().party
          .lastCaptureResult?.outcome === "caught",
      "real direct D20 throw captures and commits its level reward",
    );
    const captureParty = await state();
    assert.equal(captureParty.pokemons[0].pokemon.level, 23);
    assert.equal(captureParty.pokemons.length, 2);
    assert.equal(
      captureParty.pokemons[1].pokemon.level,
      20,
      "the caught Pokémon keeps its level; the throwing active member gets the reward",
    );
    assert.equal(captureParty.bag.items["great-ball"], 0);
    assert.equal(
      (await shopRepository.get(2)).balance,
      startingBalance + 200,
      "wild capture does not also award trainer money",
    );
    await evalArgs(playerA, () => {
      crypto.getRandomValues = window.__qaRewardRandom;
    });
    await waitLocalItemFlush({ playerA, waitArgs });
    await route(playerA);
    assert.deepEqual((await state()).pokemons, captureParty.pokemons);
    console.log(
      "PASS: automatic wild capture spends one ball, awards only the active Pokémon one level and remains idempotent after reload.",
    );

    await cdp.request("Network.enable", {}, playerA);
    await cdp.request(
      "Network.setBlockedURLs",
      { urls: [`${backendUrl}/socket.io/*`] },
      playerA,
    );
    await route(playerA);
    await fixture("reward-offline-green", "trainer", "green", 25);
    const offline = await winLocal();
    assert.equal(offline.after.pokemons[0].pokemon.level, 25);
    assert.equal(offline.after.localRewardOutbox.length, 1);
    assert.equal((await shopRepository.get(2)).balance, startingBalance + 200);
    await route(playerA);
    const savedOffline = await state();
    assert.equal(savedOffline.pokemons[0].pokemon.level, 25);
    assert.deepEqual(
      savedOffline.localRewardOutbox,
      offline.after.localRewardOutbox,
    );
    await noGate();
    await cdp.request("Network.setBlockedURLs", { urls: [] }, playerA);
    await route(playerA);
    await flushRewards();
    await until(
      async () =>
        (await shopRepository.get(2)).balance === startingBalance + 500,
      "offline green trainer reward synchronizes after reconnect",
    );
    const greenClaim = claims.find((c) =>
      c.payload.rewards.some((r) => r.encounterId === "reward-offline-green"),
    );
    assert(greenClaim);
    await originalClaim.call(shopService, greenClaim.actor, greenClaim.payload);
    assert.equal((await shopRepository.get(2)).balance, startingBalance + 500);
    assert.equal(
      (await shopRepository.get(2)).rewards.filter(
        (r) => r.encounterId === "reward-offline-green",
      ).length,
      1,
    );
    console.log(
      "PASS: an offline trainer victory updates levels without a gate, preserves its queued monetary reward on reload and credits once on reconnect.",
    );

    // The admin imports a real player's present party and defeats the actual
    // Brock preset. Player levels and money must wait for exit/finalization.
    await fixture("reward-admin-setup", "wild", "pink", 1);
    await evalArgs(playerA, async () => {
      const { transactPvpParty } = await import("/src/store/store.ts");
      await transactPvpParty(2, async (party) => ({
        party: {
          ...party,
          opponent: null,
          emerald: undefined,
          pvpRevision: party.pvpRevision + 1,
        },
        value: undefined,
      }));
    });
    const adminBefore = await state();
    await route(admin);
    await clickButton(admin, "Panel batalla");
    await clickButton(admin, "Trainer Battle");
    await waitArgs(
      admin,
      () =>
        !!document.querySelector(
          'select[aria-label="Jugador Trainer A"] option[value="2"]',
        ),
      "reward Trainer Battle lists the online real player",
    );
    await field(admin, 'select[aria-label="Categoría Trainer"]', "gym");
    await field(admin, 'select[aria-label="Preset Trainer"]', "kanto-brock");
    await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
    await clickButton(admin, "Solicitar equipo y preparar Trainer");
    await waitArgs(
      admin,
      () =>
        [...document.querySelectorAll("button")].some(
          (b) =>
            b.textContent.trim() === "Iniciar Trainer Battle" && !b.disabled,
        ),
      "reward Trainer snapshot and preset ready",
    );
    const adminBattleId = (await pvpRepository.locked())[0].battleId;
    await clickButton(admin, "Iniciar Trainer Battle");
    let adminBattle;
    for (let turn = 0; turn < 5; turn++) {
      await waitArgs(
        admin,
        () => {
          const b = document.querySelector('button[data-move-id="57"]');
          return (b && !b.disabled) || [...document.querySelectorAll("button")].some(
            (button) => button.textContent.trim() === "Salir y actualizar Party",
          );
        },
        "admin player's Surf is legal after any forced NPC replacement",
      );
      adminBattle = await pvpRepository.get(adminBattleId);
      if (adminBattle.phase === "finished") {
        await dismissHighlights(admin);
        break;
      }
      const previousSerial = adminBattle.session.runtime.serial;
      await evalArgs(admin, () =>
        document.querySelector('button[data-move-id="57"]').click(),
      );
      await until(async () => {
        adminBattle = await pvpRepository.get(adminBattleId);
        return (
          adminBattle.phase === "finished" ||
          adminBattle.session?.runtime.serial > previousSerial
        );
      }, "admin native reward turn is checkpointed");
      await waitArgs(
        admin,
        () =>
          [...document.querySelectorAll("button")].some(
            (b) => b.textContent.trim() === "Volver al combate",
          ),
        "admin winning turn summary ready",
      );
      await dismissHighlights(admin);
      adminBattle = await pvpRepository.get(adminBattleId);
      if (adminBattle.phase === "finished") break;
    }
    assert.equal(adminBattle.phase, "finished");
    assert.equal(adminBattle.session.runtime.winner, "a");
    assert.equal(
      (await state()).pokemons[0].pokemon.level,
      adminBefore.pokemons[0].pokemon.level,
    );
    assert.equal(
      (await shopRepository.get(2)).balance,
      startingBalance + 500,
      "Brock reward is not credited before the admin saves and leaves",
    );
    await clickButton(admin, "Salir y actualizar Party");
    await waitArgs(
      playerA,
      async (adminBattleId) => {
        const p = (await import("/src/store/store.ts")).store.getState().party;
        return (
          !p.pvpLock && p.pvpReceipts?.some((r) => r.battleId === adminBattleId)
        );
      },
      "admin rewards and player results saved before releasing the reservation",
      adminBattleId,
    );
    await until(
      async () =>
        (await shopRepository.get(2)).balance === startingBalance + 1700,
      "Brock victory credits exactly 1200 PD",
    );
    const adminFinal = await state();
    assert.equal(
      adminFinal.pokemons[0].pokemon.level,
      adminBefore.pokemons[0].pokemon.level + 2,
      "the human winner receives one level for each of Brock's two lower-level Pokémon",
    );
    const walletFinal = await shopRepository.get(2);
    await pvpGateway.publish();
    await shopGateway.publish();
    await route(playerA);
    assert.deepEqual((await state()).pokemons, adminFinal.pokemons);
    assert.equal((await shopRepository.get(2)).balance, walletFinal.balance);
    assert.equal(
      walletFinal.rewards.filter((r) => r.rewardId === `admin:${adminBattleId}`)
        .length,
      1,
    );
    console.log(
      "PASS: Brock's actual preset awards both KO levels and 1200 PD only on saving/exiting; replay and reload preserve one result.",
    );
  } finally {
    shopService.rewardClaim = originalClaim;
    await cdp
      .request("Network.setBlockedURLs", { urls: [] }, playerA)
      .catch(() => {});
    await evalArgs(playerA, () => {
      if (window.__qaRewardRandom)
        crypto.getRandomValues = window.__qaRewardRandom;
    }).catch(() => {});
  }
  assert.deepEqual(
    cdp.exceptions,
    [],
    "Unexpected browser exception during combat rewards",
  );
}
