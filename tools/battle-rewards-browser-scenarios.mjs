import assert from "node:assert/strict";
import { waitLocalItemFlush } from "./legacy-item-browser-fixture.mjs";
import { aimAndCompleteCapture } from "./capture-throw-browser-fixture.mjs";

/** Actual Redux/native-engine results and isolated Nest ledgers in real Chrome. */
export async function runBattleRewardsBrowserScenario({
  admin,
  playerA,
  playerB,
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
  await evalArgs(playerA, async () => {
    const { transactPvpParty } = await import("/src/store/store.ts");
    await transactPvpParty(2, async (party) => ({
      party: { ...party, bag: { ...party.bag, badges: [], rewardBadges: [] }, pvpRevision: party.pvpRevision + 1 },
      value: undefined,
    }));
  });
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
    });
    await aimAndCompleteCapture({ page: playerA, cdp, evalArgs, waitArgs,
      ballId: "great-ball", hit: true, expectedRoll: 20 });
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
    // Brock preset. Its chosen lead gains levels during battle; the player's
    // locked browser receives the final Party and gym bundle upon exit.
    await fixture("reward-admin-setup", "wild", "pink", 1);
    await evalArgs(playerA, async () => {
      const [{ transactPvpParty }, stats] = await Promise.all([
        import("/src/store/store.ts"), import("/src/lib/pokemonStats.ts"),
      ]);
      await transactPvpParty(2, async (party) => {
        const pokemons = JSON.parse(JSON.stringify(party.pokemons));
        const selectedLead = pokemons[1];
        selectedLead.moves = JSON.parse(JSON.stringify(pokemons[0].moves));
        selectedLead.pokemon.learnset = JSON.parse(JSON.stringify(pokemons[0].pokemon.learnset));
        selectedLead.pokemon.stats.forEach((stat) => {
          stat.value = stat.name === "hp" ? stats.getMaxHp(selectedLead.pokemon) : 500;
        });
        selectedLead.pokemon.battleStages = stats.neutralBattleStages();
        selectedLead.statuses = []; selectedLead.statusTurns = {};
        return { party: {
          ...party,
          pokemons,
          opponent: null,
          emerald: undefined,
          pvpRevision: party.pvpRevision + 1,
        },
        value: undefined,
      }; });
    });
    const adminBefore = await state();
    const selectedLeadId = adminBefore.pokemons[1].captureId;
    const selectedLeadLevel = adminBefore.pokemons[1].pokemon.level;
    const tmBeforeGym = adminBefore.bag.items.tm ?? 0;
    assert.equal(adminBefore.bag.badges.includes("boulder"), false);
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
    assert.equal((await pvpRepository.get(adminBattleId)).rewardBundleVersion, 2,
      "new Trainer battles opt into the current reward bundle while preserving gym rewards");
    await waitArgs(admin, () => !!document.querySelector('select[aria-label="Pokémon inicial A"]'),
      "admin may choose the initial human Pokémon from the received party");
    await field(admin, 'select[aria-label="Pokémon inicial A"]', selectedLeadId);
    await until(async () => (await pvpRepository.get(adminBattleId)).leads?.a === selectedLeadId,
      "chosen second-slot lead is durable before starting the admin battle");
    await clickButton(admin, "Iniciar Trainer Battle");
    await until(async () => (await pvpRepository.get(adminBattleId)).session?.teams.a.activeCaptureId === selectedLeadId,
      "admin battle actually starts with the selected second Pokémon");
    let adminBattle;
    let checkedLiveLevel = false;
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
      const liveLead = adminBattle.session.teams.a.pokemons.find((mon) => mon.captureId === selectedLeadId);
      if (!checkedLiveLevel && adminBattle.session.rewards?.defeats.length) {
        assert.equal(adminBattle.session.rewards.timing, "immediate");
        assert.equal(liveLead.pokemon.level, selectedLeadLevel + 1,
          "the first KO raises the chosen human lead before the next Pokémon/turn");
        assert.notEqual(adminBattle.phase, "finished",
          "the first level is already applied while Brock still has another Pokémon");
        checkedLiveLevel = true;
      }
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
    assert.equal(checkedLiveLevel, true);
    assert.equal(adminBattle.session.teams.a.pokemons.find((mon) => mon.captureId === selectedLeadId).pokemon.level,
      selectedLeadLevel + 2, "both KO levels are already present in the live battle checkpoint");
    assert.equal((await state()).pokemons[1].pokemon.level, selectedLeadLevel,
      "the reserved player browser keeps its original Party until the admin exits");
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
      adminBefore.pokemons[0].pokemon.level,
      "an unselected bench Pokémon does not receive the selected lead's KO rewards",
    );
    assert.equal(adminFinal.pokemons[1].pokemon.level, selectedLeadLevel + 2,
      "exit exports the already increased level without adding the KO rewards a second time");
    await waitArgs(playerA, async (tmBeforeGym) => {
      const bag = (await import("/src/store/store.ts")).store.getState().party.bag;
      return bag.items.tm === tmBeforeGym + 1 && bag.badges.filter((badge) => badge === "boulder").length === 1;
    }, "gym reward bundle reaches the player's Bag once", tmBeforeGym);
    const walletFinal = await shopRepository.get(2);
    assert.equal(walletFinal.items.tm, tmBeforeGym + 1);
    assert.deepEqual(walletFinal.badges, ["boulder"]);
    await pvpGateway.publish();
    await shopGateway.publish();
    await route(playerA);
    assert.deepEqual((await state()).pokemons, adminFinal.pokemons);
    assert.equal((await state()).bag.items.tm, tmBeforeGym + 1);
    assert.equal((await state()).bag.badges.filter((badge) => badge === "boulder").length, 1);
    assert.equal((await shopRepository.get(2)).balance, walletFinal.balance);
    assert.equal(
      walletFinal.rewards.filter((r) => r.rewardId === `admin:${adminBattleId}`)
        .length,
      1,
    );
    console.log(
      "PASS: selecting the second human lead starts it against Brock, each KO raises its live level, and exit grants 1200 PD/one TM/one badge without applying levels or bundles twice on replay/reload.",
    );

    // Both human selectors use the same durable lead protocol in PvP. A
    // forfeit exercises finalization without inventing KO or gym rewards.
    await route(playerB);
    await seedPvpTeam(playerB, 2, 40, 1.3);
    await evalArgs(playerB, async () => {
      const [{ transactPvpParty }, stats] = await Promise.all([
        import("/src/store/store.ts"), import("/src/lib/pokemonStats.ts"),
      ]);
      await transactPvpParty(3, async (party) => {
        const pokemons = JSON.parse(JSON.stringify(party.pokemons));
        pokemons.forEach((mon) => {
          mon.pokemon.stats.find((stat) => stat.name === "hp").value = stats.getMaxHp(mon.pokemon);
          mon.pokemon.battleStages = stats.neutralBattleStages();
          mon.statuses = []; mon.statusTurns = {};
        });
        return { party: { ...party, pokemons, pvpRevision: party.pvpRevision + 1 }, value: undefined };
      });
    });
    const pvpOriginalA = await state();
    const pvpOriginalB = await partyState(playerB);
    const pvpWalletA = await shopRepository.get(2);
    const pvpWalletB = await shopRepository.get(3);
    await clickButton(admin, "Jugadores conectados · PvP");
    await waitArgs(admin, () => !!document.querySelector('select[aria-label="Jugador PvP A"] option[value="2"]') &&
      !!document.querySelector('select[aria-label="Jugador PvP B"] option[value="3"]'),
    "PvP lead test sees both real connected players");
    await field(admin, 'select[aria-label="Jugador PvP A"]', "2");
    await field(admin, 'select[aria-label="Jugador PvP B"]', "3");
    await clickButton(admin, "Solicitar ambos equipos");
    await waitArgs(admin, () => [...document.querySelectorAll("button")].some(
      (button) => button.textContent.trim() === "Iniciar batalla PvP" && !button.disabled,
    ), "both human teams are ready before lead selection");
    const pvpBattleId = (await pvpRepository.locked())[0].battleId;
    const beforeLeads = await pvpRepository.get(pvpBattleId);
    await field(admin, 'select[aria-label="Pokémon inicial A"]', pvpOriginalA.pokemons[1].captureId);
    await until(async () => (await pvpRepository.get(pvpBattleId)).leads?.a === pvpOriginalA.pokemons[1].captureId,
      "PvP first human lead selection is durable");
    await waitArgs(admin, () => {
      const selector = document.querySelector('select[aria-label="Pokémon inicial B"]');
      return selector && !selector.disabled;
    }, "second human lead selector remains available after the first selection");
    await field(admin, 'select[aria-label="Pokémon inicial B"]', pvpOriginalB.pokemons[1].captureId);
    await until(async () => (await pvpRepository.get(pvpBattleId)).leads?.b === pvpOriginalB.pokemons[1].captureId,
      "PvP second human lead selection is durable");
    const chosenLeads = await pvpRepository.get(pvpBattleId);
    assert.deepEqual(chosenLeads.players.a.snapshot, beforeLeads.players.a.snapshot);
    assert.deepEqual(chosenLeads.players.b.snapshot, beforeLeads.players.b.snapshot,
      "changing either lead never changes the player's reserved snapshot or hash");
    await clickButton(admin, "Iniciar batalla PvP");
    await until(async () => {
      const battle = await pvpRepository.get(pvpBattleId);
      return battle.session?.teams.a.activeCaptureId === pvpOriginalA.pokemons[1].captureId &&
        battle.session?.teams.b.activeCaptureId === pvpOriginalB.pokemons[1].captureId;
    }, "PvP starts both selected second-slot Pokémon");
    assert.equal(await evalArgs(admin, () => !!document.querySelector('select[aria-label="Pokémon inicial A"]')),
      false, "initial lead selection is no longer editable after the battle begins");
    await waitArgs(admin, () => [...document.querySelectorAll('section[aria-label^="Controles de"] button')].some(
      (button) => button.textContent.trim().startsWith("Rendirse:") && !button.disabled,
    ), "admin can forfeit a real human turn");
    await evalArgs(admin, () => {
      const section = document.querySelector('section[aria-label^="Controles de"]');
      [...section.querySelectorAll("button")].find((button) => button.textContent.trim().startsWith("Rendirse:")).click();
    });
    await clickButton(admin, "Confirmar rendición", '[role="dialog"]');
    await until(async () => (await pvpRepository.get(pvpBattleId)).phase === "finished",
      "PvP forfeit finishes without a fictitious knockout");
    await waitArgs(admin, () => [...document.querySelectorAll("button")].some(
      (button) => button.textContent.trim() === "Volver al combate",
    ), "PvP forfeit result summary ready");
    await dismissHighlights(admin);
    await clickButton(admin, "Salir y actualizar Partys");
    await waitArgs(playerA, async () => !(await import("/src/store/store.ts")).store.getState().party.pvpLock,
      "PvP result releases the first player's reservation");
    await waitArgs(playerB, async () => !(await import("/src/store/store.ts")).store.getState().party.pvpLock,
      "PvP result releases the second player's reservation");
    for (const [userId, before] of [[2, pvpWalletA], [3, pvpWalletB]]) {
      const after = await shopRepository.get(userId);
      assert.equal(after.balance, before.balance);
      assert.deepEqual(after.items, before.items);
      assert.deepEqual(after.badges, before.badges);
      assert.equal(after.rewards?.length ?? 0, before.rewards?.length ?? 0,
        "a PvP outcome never adds a money, TM or badge reward");
    }
    assert.deepEqual((await state()).pokemons.map((mon) => mon.pokemon.level),
      pvpOriginalA.pokemons.map((mon) => mon.pokemon.level));
    assert.deepEqual((await partyState(playerB)).pokemons.map((mon) => mon.pokemon.level),
      pvpOriginalB.pokemons.map((mon) => mon.pokemon.level));
    console.log("PASS: PvP selects second-slot leads for both real users without changing snapshots, freezes selection at start and finalizes a forfeit without money, TM, badge or invented KO levels.");

    // The first rival encounter has its own versioned money/item bundle.
    // Use the real preset and normal admin UI so a central receipt must reach
    // the player's existing Bag together with the saved result.
    await route(playerA);
    await waitArgs(playerA, async () => {
      const party = (await import("/src/store/store.ts")).store.getState().party;
      return party.pokemons.length >= 2 && !party.pvpLock;
    }, "rival reward test rehydrates the released player Party");
    const labPartyBefore = await state();
    const labWalletBefore = await shopRepository.get(2);
    const labPreset = "kanto-rival-lab-grass";
    await clickButton(admin, "Trainer Battle");
    await waitArgs(admin, () => !!document.querySelector('select[aria-label="Jugador Trainer A"] option[value="2"]'),
      "rival reward test sees the connected human player");
    // Changing the human clears the starter choice, so choose the account first.
    await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
    await field(admin, 'select[aria-label="Categoría Trainer"]', "rival");
    await field(admin, 'select[aria-label="Inicial del jugador"]', "grass");
    await waitArgs(admin, () => !!document.querySelector('select[aria-label="Preset Trainer"] option[value="kanto-rival-lab-grass"]'),
      "the rival's first encounter matches the selected starter variant");
    await field(admin, 'select[aria-label="Preset Trainer"]', labPreset);
    await clickButton(admin, "Solicitar equipo y preparar Trainer");
    await waitArgs(admin, () => [...document.querySelectorAll("button")].some(
      (button) => button.textContent.trim() === "Iniciar Trainer Battle" && !button.disabled,
    ), "rival first encounter receives the current player snapshot");
    const labBattleId = (await pvpRepository.locked())[0].battleId;
    const labPrepared = await pvpRepository.get(labBattleId);
    assert.equal(labPrepared.trainer.presetId, labPreset);
    assert.equal(labPrepared.rewardBundleVersion, 2);
    await field(admin, 'select[aria-label="Pokémon inicial A"]', labPartyBefore.pokemons[0].captureId);
    await until(async () => (await pvpRepository.get(labBattleId)).leads?.a === labPartyBefore.pokemons[0].captureId,
      "the rival encounter starts with the selected human lead");
    await clickButton(admin, "Iniciar Trainer Battle");
    await waitArgs(admin, () => {
      const move = document.querySelector('button[data-move-id="57"]');
      return move && !move.disabled;
    }, "the human can use Surf in the actual rival encounter");
    await evalArgs(admin, () => document.querySelector('button[data-move-id="57"]').click());
    await until(async () => (await pvpRepository.get(labBattleId)).phase === "finished",
      "the first rival is defeated in a native, checkpointed battle");
    const labFinished = await pvpRepository.get(labBattleId);
    assert.equal(labFinished.session.runtime.winner, "a");
    assert.equal((await shopRepository.get(2)).balance, labWalletBefore.balance,
      "the rival does not pay before the admin saves the result");
    assert.deepEqual((await shopRepository.get(2)).items, labWalletBefore.items);
    await waitArgs(admin, () => [...document.querySelectorAll("button")].some(
      (button) => button.textContent.trim() === "Volver al combate",
    ), "rival victory summary is ready");
    await dismissHighlights(admin);
    await clickButton(admin, "Salir y actualizar Party");
    await waitArgs(playerA, async (labBattleId, balance, greatBalls) => {
      const party = (await import("/src/store/store.ts")).store.getState().party;
      return !party.pvpLock && party.pvpReceipts?.some((receipt) => receipt.battleId === labBattleId) &&
        party.bag.money === balance + 250 && (party.bag.items["great-ball"] ?? 0) === greatBalls + 1;
    }, "rival victory saves Party and adds 250 PD plus one Great Ball to the player's Bag once",
    labBattleId, labWalletBefore.balance, labWalletBefore.items["great-ball"] ?? 0);
    const labWalletAfter = await shopRepository.get(2);
    const labPartyAfter = await state();
    const labReceipt = labWalletAfter.rewards.find((receipt) => receipt.rewardId === `admin:${labBattleId}`);
    assert.equal(labWalletAfter.balance, labWalletBefore.balance + 250);
    assert.deepEqual(labWalletAfter.items, {
      ...labWalletBefore.items,
      "great-ball": (labWalletBefore.items["great-ball"] ?? 0) + 1,
    });
    assert.deepEqual(labWalletAfter.badges, labWalletBefore.badges,
      "the rival grants no gym badge");
    assert.equal(labPartyAfter.bag.items.tm ?? 0, labPartyBefore.bag.items.tm ?? 0,
      "the rival grants a Great Ball rather than a gym TM");
    assert.equal(labReceipt.status, "credited");
    assert.equal(labReceipt.rewardBundleVersion, 2);
    assert.equal(labReceipt.amount, 250);
    assert.deepEqual(labReceipt.items, { "great-ball": 1 });
    assert.equal(labReceipt.badgeId, undefined);
    assert.equal(labPartyAfter.pokemons[0].pokemon.level,
      labPartyBefore.pokemons[0].pokemon.level + 1, "the ordinary KO level is conserved independently of the new reward bundle");
    const repeated = await shopService.creditBattleReward(2, labBattleId, labPreset, labReceipt.epoch, 2);
    const { requestHash: _labRequestHash, ...visibleLabReceipt } = labReceipt;
    assert.deepEqual(repeated, visibleLabReceipt,
      "replaying the same completed rival reward returns its original receipt");
    await pvpGateway.publish();
    await shopGateway.publish();
    await route(playerA);
    await waitArgs(playerA, async (balance, greatBalls) => {
      const party = (await import("/src/store/store.ts")).store.getState().party;
      return party.bag.money === balance && party.bag.items["great-ball"] === greatBalls;
    }, "reloaded player retains exactly the confirmed rival money and ball",
    labWalletAfter.balance, labWalletAfter.items["great-ball"]);
    assert.deepEqual((await state()).pokemons, labPartyAfter.pokemons);
    const labReplayed = await shopRepository.get(2);
    assert.equal(labReplayed.revision, labWalletAfter.revision);
    assert.equal(labReplayed.balance, labWalletAfter.balance);
    assert.deepEqual(labReplayed.items, labWalletAfter.items);
    assert.equal(labReplayed.rewards.filter((receipt) => receipt.rewardId === `admin:${labBattleId}`).length, 1);
    console.log("PASS: defeating the real first rival with reward bundle 2 grants exactly 250 PD and one Great Ball at exit, preserves KO progression, grants no gym extras and never repeats money or stock on receipt replay, publish or player reload.");
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
