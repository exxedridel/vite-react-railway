/** Real Chrome UI + MySQL identity app (memory repository) + isolated Nest relay. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
import { runShopBrowserScenario } from "./shop-browser-scenarios.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nestRoot = resolve(root, "../nest-mongo-pokedex");
const mysqlRoot = resolve(root, "../mysql-restapi");
const require = createRequire(join(root, "package.json"));
const requireNest = createRequire(join(nestRoot, "package.json"));
const requireMysql = createRequire(join(mysqlRoot, "package.json"));
const { io } = requireNest("socket.io-client");
const WebSocket = require("ws");
const bcrypt = requireMysql("bcryptjs");
const TEST_SECRET = "pokemon-users-browser-test-only-secret-no-production-use";
const TEST_PASSWORD = "Browser-fixture-password-123";
const ADMIN_EMAIL = "qa-admin@example.test";
const OTHER_EMAIL = "qa-observer@example.test";
const PLAYER_EMAIL = "qa-player@example.test";
const NEW_EMAIL = "created-player@example.test";
const EDITED_EMAIL = "edited-player@example.test";
const pause = (ms) =>
  new Promise((resolvePause) => setTimeout(resolvePause, ms));
async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timeout: ${label}`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class ChromeConnection {
  sequence = 0;
  pending = new Map();
  exceptions = [];

  constructor(socket) {
    this.socket = socket;
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") {
        const detail = message.params.exceptionDetails;
        this.exceptions.push(
          (
            detail.exception?.description ??
            detail.text ??
            "Browser exception"
          ).slice(0, 500),
        );
      }
    });
    socket.on("close", () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Chrome DevTools connection closed"));
      }
      this.pending.clear();
    });
    // Requests already reject on close; an error event must not terminate Node unhandled.
    socket.on("error", () => {});
  }

  request(method, params = {}, sessionId) {
    const id = ++this.sequence;
    return new Promise((resolveRequest, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: Chrome ${method}`));
      }, 10000);
      this.pending.set(id, { resolve: resolveRequest, reject, timer });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
        (error) => {
          if (!error) return;
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        },
      );
    });
  }

  async evaluate(sessionId, expression) {
    const result = await this.request(
      "Runtime.evaluate",
      {
        expression,
        returnByValue: true,
        awaitPromise: true,
      },
      sessionId,
    );
    if (result.exceptionDetails)
      throw new Error(
        (result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text) +
          `; expression: ${expression.slice(0, 350)}`,
      );
    return result.result.value;
  }

  async waitFor(sessionId, expression, label, milliseconds = 30000) {
    const deadline = Date.now() + milliseconds;
    do {
      if (await this.evaluate(sessionId, expression)) return;
      await pause(150);
    } while (Date.now() < deadline);
    const page = await this.evaluate(
      sessionId,
      "document.body?.innerText?.slice(0, 1800)",
    );
    throw new Error(`Timeout: ${label}. Page: ${page}`);
  }
}

let app;
let authServer;
let repository;
let vite;
let chrome;
let cdp;
let profile;
let cleanupPromise;
let authFailure = null;
let logoutAttempts = 0;
const savedEnvironment = new Map(
  [
    "AUTH_API_URL",
    "JWT_SECRET",
    "FRONTEND_ORIGINS",
    "VITE_WEBSOCKET_URL",
    "VITE_BASE_SERVICES",
    "VITE_BASE_MIDDLEWARE",
  ].map((key) => [key, process.env[key]]),
);

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    if (cdp) {
      await bounded(cdp.request("Browser.close"), 3000, "closing Chrome").catch(
        () => {},
      );
      cdp.socket.close();
    }
    if (chrome && chrome.exitCode === null) {
      await bounded(once(chrome, "exit"), 4000, "Chrome exit").catch(() => {});
      if (chrome.exitCode === null) {
        if (process.platform === "win32") {
          // Only the browser process created by this script and its children are stopped.
          const killer = spawn(
            "taskkill",
            ["/PID", String(chrome.pid), "/T", "/F"],
            {
              windowsHide: true,
              stdio: "ignore",
            },
          );
          await bounded(
            once(killer, "exit"),
            4000,
            "stopping test Chrome",
          ).catch(() => {});
        } else chrome.kill("SIGKILL");
      }
    }
    if (vite) await bounded(vite.close(), 5000, "closing Vite").catch(() => {});
    if (app) await bounded(app.close(), 5000, "closing Nest").catch(() => {});
    if (authServer) {
      authServer.closeAllConnections();
      await bounded(
        new Promise((resolveClose) => authServer.close(resolveClose)),
        5000,
        "closing auth HTTP",
      ).catch(() => {});
    }
    if (profile) {
      const checkedProfile = resolve(profile);
      // Recursive cleanup is restricted to the fresh temporary profile we created.
      assert.equal(dirname(checkedProfile), resolve(tmpdir()));
      assert.ok(basename(checkedProfile).startsWith("pokemon-users-browser-"));
      await rm(checkedProfile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    }
    for (const [key, value] of savedEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  })();
  return cleanupPromise;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  });
}

async function field(sessionId, selector, value) {
  await cdp.evaluate(
    sessionId,
    `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing field: ' + ${JSON.stringify(selector)});
    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  })()`,
  );
}

async function clickButton(sessionId, text, scope = "body") {
  await cdp.evaluate(
    sessionId,
    `(() => {
    const button = [...document.querySelector(${JSON.stringify(scope)}).querySelectorAll('button')]
      .find(element => element.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) throw new Error('Missing or disabled button: ' + ${JSON.stringify(text)});
    button.click();
  })()`,
  );
}

async function clickLabel(sessionId, label) {
  await cdp.evaluate(
    sessionId,
    `(() => {
    const element = [...document.querySelectorAll('[aria-label]')]
      .find(item => item.getAttribute('aria-label') === ${JSON.stringify(label)});
    if (!element || element.disabled) throw new Error('Missing action: ' + ${JSON.stringify(label)});
    element.click();
  })()`,
  );
}

async function navigate(sessionId, frontendUrl, path) {
  await cdp.request("Page.navigate", { url: frontendUrl + path }, sessionId);
  await cdp.waitFor(
    sessionId,
    `location.pathname === ${JSON.stringify(path)} && !!document.querySelector('main')`,
    `navigation to ${path}`,
  );
}

async function openAccount(email, frontendUrl) {
  const { browserContextId } = await cdp.request(
    "Target.createBrowserContext",
    { disposeOnDetach: true },
  );
  const { targetId } = await cdp.request("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.request("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await cdp.request("Page.enable", {}, sessionId);
  await cdp.request("Runtime.enable", {}, sessionId);
  await cdp.request(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source:
        'try { localStorage.setItem("vite-ui-theme", "light"); } catch {}',
    },
    sessionId,
  );
  await cdp.request("Page.navigate", { url: frontendUrl + "/" }, sessionId);
  await cdp.waitFor(
    sessionId,
    '!!document.querySelector("input[name=email]")',
    "real login form",
  );
  await field(sessionId, "input[name=email]", email);
  await field(sessionId, "input[name=password]", TEST_PASSWORD);
  await cdp.waitFor(
    sessionId,
    '!document.querySelector("button[type=submit]")?.disabled',
    "enabled login button",
  );
  await cdp.evaluate(
    sessionId,
    'document.querySelector("button[type=submit]").click()',
  );
  await cdp.waitFor(
    sessionId,
    `location.pathname === "/dashboard" && !!document.querySelector('a[href="/mensajes-prueba"]')`,
    "authenticated dashboard",
    45000,
  );
  return sessionId;
}

async function api(sessionId, authUrl, path, method = "GET", body) {
  return cdp.evaluate(
    sessionId,
    `(async () => {
    const response = await fetch(${JSON.stringify(authUrl + "/api" + path)}, {
      method: ${JSON.stringify(method)},
      headers: { Authorization: 'Bearer ' + localStorage.getItem('bearer_token'), 'Content-Type': 'application/json' },
      ${body === undefined ? "" : `body: ${JSON.stringify(JSON.stringify(body))},`}
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  })()`,
  );
}

async function capturedToken(sessionId) {
  const token = await cdp.evaluate(
    sessionId,
    'localStorage.getItem("bearer_token")',
  );
  assert.ok(
    typeof token === "string" && token.length > 0,
    "Expected fixture session",
  );
  return token;
}

async function tokenStatus(authUrl, token) {
  const response = await fetch(`${authUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  await response.arrayBuffer();
  return response.status;
}

async function expectTokenStatus(authUrl, token, status) {
  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    if ((await tokenStatus(authUrl, token)) === status) return;
    await pause(100);
  }
  assert.fail(`The captured test session never returned HTTP ${status}`);
}

async function independentLogin(authUrl, email) {
  const response = await fetch(`${authUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(typeof body.token === "string" && body.token.length > 0);
  return body.token;
}

async function expectRevokedSocket(backendUrl, token) {
  const socket = io(`${backendUrl}/mensajes-prueba`, {
    auth: { token },
    transports: ["websocket"],
    autoConnect: false,
    reconnection: false,
    forceNew: true,
    timeout: 5000,
  });
  try {
    const error = await bounded(
      new Promise((resolveError, reject) => {
        socket.once("connect", () =>
          reject(new Error("A revoked session connected to Nest")),
        );
        socket.once("connect_error", resolveError);
        socket.connect();
      }),
      7000,
      "revoked JWT WebSocket rejection",
    );
    assert.equal(error.data?.code, "SESSION_REVOKED");
    assert.equal(socket.connected, false);
  } finally {
    socket.disconnect();
    socket.removeAllListeners();
  }
}

async function seedLogoutParty(sessionId, userId) {
  return cdp.evaluate(
    sessionId,
    `(async () => {
    const [{store,persistor},actions,storage] = await Promise.all([
      import('/src/store/store.ts'), import('/src/slices/partySlice.ts'),
      import('/src/store/accountStorage.ts')
    ]);
    if (storage.getActiveAccountId() !== ${JSON.stringify(userId)}) throw new Error('Wrong account owner before logout');
    store.dispatch(actions.configureGame({regions:['kanto'],startingLevel:5,hpMultiplier:1.3}));
    store.dispatch(actions.addPokemon({
      id:1,name:'bulbasaur',image:null,types:['grass','poison'],
      stats:['hp','attack','defense','special-attack','special-defense','speed'].map(name=>({name,value:50})),
      learnset:{versionGroup:'emerald',moves:[{id:33,name:'tackle'}]}
    }));
    localStorage.setItem(storage.accountNicknameKey(${JSON.stringify(userId)}),'QA logout owner');
    await persistor.flush();
    const raw=localStorage.getItem(storage.accountStorageKey(${JSON.stringify(userId)}));
    if (!raw || store.getState().party.pokemons.length !== 1) throw new Error('Nonempty logout fixture was not saved');
    return {party:JSON.parse(JSON.parse(raw).party),nickname:'QA logout owner'};
  })()`,
  );
}

async function expectLocalLogout(sessionId, userId, saved) {
  await cdp.waitFor(
    sessionId,
    'location.pathname === "/" && !!document.querySelector("input[name=email]") && localStorage.getItem("bearer_token") === null',
    "logout returns to login and removes local token",
    12000,
  );
  await cdp.waitFor(
    sessionId,
    `(async () => {
    const [{store},storage]=await Promise.all([import('/src/store/store.ts'),import('/src/store/accountStorage.ts')]);
    return storage.getActiveAccountId()===null && store.getState().party.pokemons.length===0;
  })()`,
    "logout clears the in-memory party and account owner",
  );
  const after = await cdp.evaluate(
    sessionId,
    `(async () => {
    const storage=await import('/src/store/accountStorage.ts');
    const raw=localStorage.getItem(storage.accountStorageKey(${JSON.stringify(userId)}));
    return {party:raw?JSON.parse(JSON.parse(raw).party):null,nickname:localStorage.getItem(storage.accountNicknameKey(${JSON.stringify(userId)}))};
  })()`,
  );
  assert.deepEqual(
    after,
    saved,
    "Logout must preserve the owner's saved party and nickname",
  );
}

async function expectPeerOffline(observer, userId) {
  await chooseRecipient(observer, userId);
  await cdp.waitFor(
    observer,
    'document.body.innerText.includes("Destinatario desconectado")',
    "logout disconnects the browser's live message socket",
  );
}

async function userDialog(sessionId, values) {
  await cdp.waitFor(
    sessionId,
    '!!document.querySelector("#user-email")',
    "user editor",
  );
  for (const [selector, value] of Object.entries(values))
    await field(sessionId, selector, value);
  await cdp.evaluate(
    sessionId,
    'document.querySelector("[role=dialog] form").requestSubmit()',
  );
  await cdp.waitFor(
    sessionId,
    '!document.querySelector("[role=dialog]")',
    "saved user editor",
  );
}

async function chooseRecipient(sessionId, userId) {
  await cdp.waitFor(
    sessionId,
    `document.body.innerText.includes('Conectado con Nest') && !!document.querySelector('#message-recipient option[value="${userId}"]')`,
    "connected chat with dynamic contact",
    45000,
  );
  await field(sessionId, "#message-recipient", String(userId));
  await cdp.waitFor(
    sessionId,
    `document.querySelector('#message-recipient').value === ${JSON.stringify(String(userId))}`,
    "selected recipient",
  );
}

async function sendFromPage(sessionId, text) {
  await field(sessionId, "#test-message", text);
  await cdp.waitFor(
    sessionId,
    '!document.querySelector("button[type=submit]")?.disabled',
    "enabled send button",
  );
  await cdp.evaluate(
    sessionId,
    'document.querySelector("button[type=submit]").click()',
  );
}

async function expectMessages(sessionId, expected) {
  await cdp.waitFor(
    sessionId,
    `(() => {
    const texts = [...document.querySelectorAll('[role="log"] article')]
      .map(article => article.querySelectorAll('p')[1]?.textContent);
    return JSON.stringify(texts) === ${JSON.stringify(JSON.stringify(expected))};
  })()`,
    `${expected.length} private messages without duplicates`,
  );
}

async function evalArgs(sessionId, fn, ...args) {
  return cdp.evaluate(
    sessionId,
    "(" +
      fn.toString() +
      ")(" +
      args.map((value) => JSON.stringify(value)).join(",") +
      ")",
  );
}
async function waitArgs(sessionId, fn, label, ...args) {
  return cdp.waitFor(
    sessionId,
    "(" +
      fn.toString() +
      ")(" +
      args.map((value) => JSON.stringify(value)).join(",") +
      ")",
    label,
    45000,
  );
}
async function seedPvpTeam(sessionId, count, hpFirst, multiplier) {
  return evalArgs(
    sessionId,
    async (count, hpFirst, multiplier) => {
      const [{ store, transactPvpParty }, actions, storage, statsModule] =
        await Promise.all([
          import("/src/store/store.ts"),
          import("/src/slices/partySlice.ts"),
          import("/src/store/accountStorage.ts"),
          import("/src/lib/pokemonStats.ts"),
        ]);
      const owner = storage.getActiveAccountId();
      if (!owner) throw new Error("No account owns the Party fixture");
      return transactPvpParty(owner, async (latest) => {
        const configured = actions.default(
          latest,
          actions.configureGame({
            regions: ["kanto"],
            startingLevel: 20,
            hpMultiplier: multiplier,
          }),
        );
        const party = JSON.parse(JSON.stringify(configured));
        party.pokemons = Array.from({ length: count }, () => {
          const base = {
            id: 35,
            name: "clefairy",
            image: null,
            types: ["fairy"],
            stats: [
              "hp",
              "attack",
              "defense",
              "special-attack",
              "special-defense",
              "speed",
            ].map((name) => ({ name, value: 50 })),
            learnset: {
              versionGroup: "emerald",
              moves: [
                { id: 150, name: "splash" },
                { id: 33, name: "tackle" },
              ],
            },
          };
          return {
            captureId: crypto.randomUUID(),
            origin: "wild",
            pokemon: statsModule.createLeveledPokemon(
              base,
              base.stats,
              20,
              multiplier,
            ),
            moves: [],
            statuses: [],
            statusTurns: {},
          };
        });
        party.pokemons.forEach((capture, index) => {
          capture.pokemon.stats.find((stat) => stat.name === "hp").value =
            index === 0 ? hpFirst : 0;
          capture.moves = [
            {
              id: 150,
              name: "splash",
              displayName: "Splash",
              type: "normal",
              damageClass: "status",
              power: null,
              accuracy: null,
              pp: 40,
              priority: 0,
              description: "Test move",
              source: "tm",
            },
          ];
          capture.statuses = index === 0 ? ["burned"] : [];
          capture.statusTurns = {};
        });
        party.bag = { ...party.bag, badges: ["boulder"] };
        party.pvpRevision = storage.pvpPartyRevision(latest) + 1;
        return { party, value: JSON.parse(JSON.stringify(party)) };
      });
    },
    count,
    hpFirst,
    multiplier,
  );
}
async function partyState(sessionId) {
  return evalArgs(sessionId, async () => {
    const { store } = await import("/src/store/store.ts");
    return JSON.parse(JSON.stringify(store.getState().party));
  });
}

try {
  console.log(
    "Browser QA: real identity app, isolated Nest relay and local Vite (no databases).",
  );
  const { createApp } = await import(
    pathToFileURL(join(mysqlRoot, "src/app.js")).href
  );
  const { MemoryUsersRepository } = await import(
    pathToFileURL(join(mysqlRoot, "tests/support/memory-users.repository.js"))
      .href
  );
  const hash = await bcrypt.hash(TEST_PASSWORD, 4);
  repository = new MemoryUsersRepository([
    {
      id: 1,
      email: ADMIN_EMAIL,
      first_name: "QA",
      last_name: "Admin",
      role: "admin",
      password: hash,
    },
    {
      id: 2,
      email: PLAYER_EMAIL,
      first_name: "QA",
      last_name: "Player",
      role: "player",
      password: hash,
    },
    {
      id: 3,
      email: OTHER_EMAIL,
      first_name: "QA",
      last_name: "Observer",
      role: "player",
      password: hash,
    },
  ]);
  const authApp = createApp({
    usersRepository: repository,
    jwtSecret: TEST_SECRET,
  });
  authServer = await new Promise((resolveListen) => {
    const server = createHttpServer((request, response) => {
      if (request.url === "/api/logout" && request.method === "POST")
        logoutAttempts++;
      if (authFailure === "offline") {
        request.socket.destroy();
        return;
      }
      if (
        authFailure === "profile" &&
        request.url === "/api/auth/me" &&
        request.method === "GET"
      ) {
        response.writeHead(503, {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        });
        response.end(
          JSON.stringify({
            message: "Simulated temporary profile outage",
            code: "AUTH_UNAVAILABLE",
          }),
        );
        return;
      }
      authApp(request, response);
    });
    server.listen(0, "127.0.0.1", () => resolveListen(server));
  });
  const authUrl = `http://127.0.0.1:${authServer.address().port}`;
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.AUTH_API_URL = authUrl;
  requireNest("reflect-metadata");
  const { NestFactory } = requireNest("@nestjs/core");
  const { Module } = requireNest("@nestjs/common");
  const { MessagesModule } = requireNest(
    join(nestRoot, "dist/messages/messages.module.js"),
  );
  class BrowserUsersRoot {}
  const { PvpModule } = requireNest(join(nestRoot, "dist/pvp/pvp.module.js"));
  const { MongoPvpRepository, PvpBattleSchema } = requireNest(
    join(nestRoot, "dist/pvp/pvp.repository.js"),
  );
  const { PvpGateway } = requireNest(join(nestRoot, "dist/pvp/pvp.gateway.js"));
  const { PvpService } = requireNest(join(nestRoot, "dist/pvp/pvp.service.js"));
  const { createMongoosePvpFixture } = requireNest(
    join(nestRoot, "test/support/mongoose-pvp-model.cjs"),
  );
  const persistence = createMongoosePvpFixture({
    mongoose: requireNest("mongoose"),
    schema: PvpBattleSchema,
  });
  const pvpRepository = new MongoPvpRepository(persistence.model);
  const { ShopModule } = requireNest(
    join(nestRoot, "dist/shop/shop.module.js"),
  );
  const { MemoryShopRepository } = requireNest(
    join(nestRoot, "dist/shop/shop.repository.js"),
  );
  const { ShopService } = requireNest(
    join(nestRoot, "dist/shop/shop.service.js"),
  );
  const { ShopGateway } = requireNest(
    join(nestRoot, "dist/shop/shop.gateway.js"),
  );
  const shopRepository = new MemoryShopRepository();
  Module({
    imports: [
      MessagesModule,
      PvpModule.withRepository(pvpRepository),
      ShopModule.withRepository(shopRepository),
    ],
  })(BrowserUsersRoot);
  app = await bounded(
    NestFactory.create(BrowserUsersRoot, { logger: false }),
    10000,
    "Nest startup",
  );
  await bounded(app.listen(0, "127.0.0.1"), 10000, "Nest listen");
  const backendUrl = await app.getUrl();
  process.env.VITE_WEBSOCKET_URL = backendUrl;
  process.env.VITE_BASE_SERVICES = backendUrl;
  process.env.VITE_BASE_MIDDLEWARE = authUrl;
  vite = await bounded(
    createServer({
      root,
      envFile: false,
      define: {
        "import.meta.env.VITE_WEBSOCKET_URL": JSON.stringify(backendUrl),
        "import.meta.env.VITE_BASE_SERVICES": JSON.stringify(backendUrl),
        "import.meta.env.VITE_BASE_MIDDLEWARE": JSON.stringify(authUrl),
      },
      logLevel: "error",
      server: { host: "127.0.0.1", port: 0, strictPort: false },
    }),
    15000,
    "Vite startup",
  );
  await bounded(vite.listen(), 10000, "Vite listen");
  const frontendUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  process.env.FRONTEND_ORIGINS = frontendUrl;
  profile = await mkdtemp(join(tmpdir(), "pokemon-users-browser-"));
  const chromePath =
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe";
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  const debuggerUrl = await bounded(
    new Promise((resolveDebugger, reject) => {
      let stderr = "";
      chrome.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-12000);
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) resolveDebugger(match[1]);
      });
      chrome.once("error", reject);
      chrome.once("exit", (code) =>
        reject(new Error(`Chrome exited before DevTools was ready (${code}).`)),
      );
    }),
    15000,
    "Chrome DevTools startup",
  );
  const websocket = new WebSocket(debuggerUrl);
  await bounded(once(websocket, "open"), 10000, "DevTools WebSocket");
  cdp = new ChromeConnection(websocket);

  const admin = await openAccount(ADMIN_EMAIL, frontendUrl);
  const playerA = await openAccount(PLAYER_EMAIL, frontendUrl);
  const playerB = await openAccount(OTHER_EMAIL, frontendUrl);
  if (process.argv.includes("--shop-only")) {
    await runShopBrowserScenario({
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
      shopService: app.get(ShopService),
      shopGateway: app.get(ShopGateway),
      pvpRepository,
      pvpService: app.get(PvpService),
      pvpGateway: app.get(PvpGateway),
    });
  } else {
    const originalA = await seedPvpTeam(playerA, 1, 17, 1);
    const originalB = await seedPvpTeam(playerB, 6, 29, 2);
    await clickButton(admin, "Panel batalla");
    await waitArgs(
      admin,
      () =>
        !!document.querySelector(
          'select[aria-label="Jugador PvP A"] option[value="2"]',
        ) &&
        !!document.querySelector(
          'select[aria-label="Jugador PvP B"] option[value="3"]',
        ),
      "two online players in PvP lobby",
    );
    await field(admin, 'select[aria-label="Jugador PvP A"]', "2");
    await field(admin, 'select[aria-label="Jugador PvP B"]', "3");
    await clickButton(admin, "Solicitar ambos equipos");
    await waitArgs(
      admin,
      () =>
        [...document.querySelectorAll("button")].some(
          (button) =>
            button.textContent.trim() === "Iniciar batalla PvP" &&
            !button.disabled,
        ),
      "both current parties imported",
    );
    const rows = await pvpRepository.locked();
    assert.equal(rows.length, 1);
    const battleId = rows[0].battleId;
    let battle = await pvpRepository.get(battleId);
    assert.equal(battle.players.a.snapshot.pokemons.length, 1);
    assert.equal(battle.players.b.snapshot.pokemons.length, 6);
    assert.deepEqual(battle.players.a.snapshot.pokemons, originalA.pokemons);
    assert.deepEqual(battle.players.b.snapshot.pokemons, originalB.pokemons);
    for (const session of [playerA, playerB]) {
      await waitArgs(
        session,
        () => !!document.querySelector('[data-testid="pvp-party-lock"]'),
        "player party locked",
      );
      await evalArgs(session, async () => {
        const [{ store }, actions] = await Promise.all([
          import("/src/store/store.ts"),
          import("/src/slices/partySlice.ts"),
        ]);
        const before = JSON.stringify(store.getState().party);
        store.dispatch(actions.resetGame());
        store.dispatch(
          actions.changeBagMoney({ amount: 100, direction: "add" }),
        );
        store.dispatch(
          actions.changePokemonHp({
            captureId: store.getState().party.pokemons[0].captureId,
            amount: 500,
          }),
        );
        if (JSON.stringify(store.getState().party) !== before)
          throw new Error("A locked party was mutated");
      });
    }
    console.log(
      "PvP Chrome: 1- and 6-Pokemon snapshots preserved current HP/types/statuses and all player mutations are blocked.",
    );
    await clickButton(admin, "Iniciar batalla PvP");
    await waitArgs(
      admin,
      () => document.querySelectorAll("button[data-move-id]").length >= 2,
      "admin controls both teams",
    );
    battle = await pvpRepository.get(battleId);
    const serialBeforePause = battle.session.runtime.serial;
    const gateway = app.get(PvpGateway);
    const service = app.get(PvpService);
    assert.deepEqual(
      persistence.rows.get(battleId).session.runtime.pending,
      {},
    );
    assert.deepEqual(persistence.rows.get(battleId).commandHashes, {});
    // A malformed incoming envelope must show a recoverable error, never crash
    // React or execute its queued commands. The accepted checkpoint is unchanged.
    const adminActor = [...service.actors.values()].find(
      (actor) => actor.user.id === 1,
    );
    const incomplete = service.view(battle, adminActor);
    delete incomplete.session.runtime.pending;
    incomplete.commands = [{ commandId: "malformed-envelope-only", side: "a" }];
    for (const socket of gateway.namespace.sockets.values()) {
      if (socket.data.identity?.user.id === 1)
        socket.emit("pvp:state", incomplete);
    }
    await waitArgs(
      admin,
      () =>
        document.body.innerText.includes(
          "El estado del combate está incompleto",
        ),
      "incomplete checkpoint is reported without a black screen",
    );
    assert.equal(
      await evalArgs(
        admin,
        () => document.querySelectorAll("button[data-move-id]").length,
      ),
      0,
    );
    assert.equal(
      (await pvpRepository.get(battleId)).session.runtime.serial,
      serialBeforePause,
    );
    assert.ok((await partyState(playerA)).pvpLock);
    assert.ok((await partyState(playerB)).pvpLock);
    await clickButton(admin, "Actualizar conexión");
    await waitArgs(
      admin,
      () => document.querySelectorAll("button[data-move-id]").length >= 2,
      "valid synchronization restores the battle controls",
    );
    // Reproduce an already-persisted document written by minimize:true. Reads
    // through the REAL Mongo repository must repair only known empty maps.
    persistence.rows.set(
      battleId,
      new persistence.model(persistence.rows.get(battleId)).toObject({
        minimize: true,
      }),
    );
    assert.equal(
      persistence.rows.get(battleId).session.runtime.pending,
      undefined,
    );
    assert.equal(persistence.rows.get(battleId).commandHashes, undefined);
    assert.deepEqual(
      (await pvpRepository.get(battleId)).players.a.snapshot.pokemons,
      originalA.pokemons,
    );
    // Model a phone leaving its document; close its server socket so the test does
    // not depend on the polling heartbeat duration of an abandoned browser page.
    await cdp.request("Page.navigate", { url: "about:blank" }, playerA);
    for (const socket of gateway.namespace.sockets.values()) {
      if (socket.data.identity?.user.id === 2) socket.disconnect(true);
    }
    await waitArgs(
      admin,
      () => document.body.innerText.includes("Combate en pausa"),
      "battle pauses for disconnected player",
    );
    assert.equal(
      (await pvpRepository.get(battleId)).session.runtime.serial,
      serialBeforePause,
    );
    await cdp.request(
      "Page.navigate",
      { url: frontendUrl + "/dashboard" },
      playerA,
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="pvp-party-lock"]'),
      "reload retains the party lock",
    );
    await waitArgs(
      admin,
      () =>
        [...document.querySelectorAll("button[data-move-id]")].some(
          (button) => !button.disabled,
        ),
      "battle resumes only after reconnection",
    );
    assert.equal((await partyState(playerA)).pvpLock.battleId, battleId);
    await cdp.request("Page.reload", {}, admin);
    await waitArgs(
      admin,
      () => document.querySelectorAll("button[data-move-id]").length >= 2,
      "administrator restores checkpoint after reload",
    );
    assert.equal(
      (await pvpRepository.get(battleId)).session.runtime.serial,
      serialBeforePause,
    );
    console.log(
      "PvP Chrome: real Mongoose writes preserve empty maps; incomplete UI state is recoverable; legacy Mongo checkpoint survives player/admin reconnect with reservations intact.",
    );
    // One real round consumes PP and applies residual damage before surrender.
    await evalArgs(admin, () => {
      const controls = document.querySelectorAll(
        'section[aria-label^="Controles de"]',
      );
      const button = controls[0].querySelector('button[data-move-id="150"]');
      if (!button || button.disabled)
        throw new Error("First side cannot choose Splash");
      button.click();
    });
    await waitArgs(
      admin,
      () => {
        const controls = document.querySelectorAll(
          'section[aria-label^="Controles de"]',
        );
        return (
          !!controls[1]?.querySelector('button[data-move-id="150"]') &&
          !controls[1].querySelector('button[data-move-id="150"]').disabled &&
          controls[0].textContent.includes("Acción elegida")
        );
      },
      "first pending action is checkpointed",
    );
    await evalArgs(admin, () =>
      document
        .querySelectorAll('section[aria-label^="Controles de"]')[1]
        .querySelector('button[data-move-id="150"]')
        .click(),
    );
    await waitArgs(
      admin,
      () => {
        const controls = document.querySelectorAll(
          'section[aria-label^="Controles de"]',
        );
        return (
          controls.length === 2 &&
          [...document.querySelectorAll('button[data-move-id="150"]')].every(
            (button) => !button.disabled,
          ) &&
          !controls[0].textContent.includes("Acción elegida")
        );
      },
      "real round resolved by the administrator",
    );
    battle = await pvpRepository.get(battleId);
    assert.ok(battle.session.runtime.turn >= 2);
    assert.ok(battle.session.runtime.requests.a.moves[0].pp < 40);
    assert.deepEqual(
      (await partyState(playerA)).pokemons,
      originalA.pokemons,
      "Local party is not patched before closing the battle",
    );
    await waitArgs(
      admin,
      () => !!document.querySelector('[role="dialog"]'),
      "turn summary dialog",
    );
    await clickButton(admin, "Volver al combate", "[role=dialog]");
    await waitArgs(
      admin,
      () => !document.querySelector('[role="dialog"]'),
      "close the round summary",
    );
    await evalArgs(admin, () =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent.trim().startsWith("Rendirse:"))
        .click(),
    );
    await waitArgs(
      admin,
      () =>
        [...document.querySelectorAll('[role="dialog"] button')].some(
          (button) => button.textContent.trim() === "Confirmar rendición",
        ),
      "forfeit confirmation dialog",
    );
    await clickButton(admin, "Confirmar rendición", "[role=dialog]");
    await waitArgs(
      admin,
      () =>
        [...document.querySelectorAll("button")].some(
          (button) => button.textContent.trim() === "Salir y actualizar Partys",
        ),
      "forfeit declares the other winner",
    );
    battle = await pvpRepository.get(battleId);
    assert.equal(battle.phase, "finished");
    assert.equal(battle.session.runtime.winner, "b");
    assert.ok((await partyState(playerA)).pvpLock);
    assert.ok((await partyState(playerB)).pvpLock);
    assert.deepEqual(
      (await partyState(playerA)).pokemons,
      originalA.pokemons,
      "The final patch waits for admin exit",
    );
    const expectedA = battle.session.teams.a.pokemons,
      expectedB = battle.session.teams.b.pokemons;
    await waitArgs(
      admin,
      () => !!document.querySelector('[role="dialog"]'),
      "forfeit summary",
    );
    await clickButton(admin, "Volver al combate", "[role=dialog]");
    await waitArgs(
      admin,
      () => !document.querySelector('[role="dialog"]'),
      "close forfeit summary",
    );
    await clickButton(admin, "Salir y actualizar Partys");
    for (const session of [playerA, playerB]) {
      await waitArgs(
        session,
        () =>
          !document.querySelector('[data-testid="pvp-party-lock"]') &&
          !!document.querySelector('a[href="/mensajes-prueba"]'),
        "authoritative result applied and party unlocked",
      );
    }
    battle = await pvpRepository.get(battleId);
    assert.equal(battle.phase, "finalized");
    assert.equal(battle.lockHeld, false);
    const finalA = await partyState(playerA),
      finalB = await partyState(playerB);
    for (const [current, expected, original] of [
      [finalA, expectedA, originalA],
      [finalB, expectedB, originalB],
    ]) {
      assert.equal(current.pvpLock, null);
      assert.equal(current.pvpReceipts.length, 1);
      assert.deepEqual(current.bag, original.bag);
      for (const capture of current.pokemons) {
        const evolved = expected.find(
          (entry) => entry.captureId === capture.captureId,
        );
        assert.equal(
          capture.pokemon.stats.find((stat) => stat.name === "hp").value,
          evolved.pokemon.stats.find((stat) => stat.name === "hp").value,
        );
        assert.deepEqual(capture.statuses, evolved.statuses);
        assert.deepEqual(
          capture.moves,
          original.pokemons.find(
            (entry) => entry.captureId === capture.captureId,
          ).moves,
        );
      }
    }
    const afterPlay = await evalArgs(playerA, async () => {
      const [{ store, persistor }, actions] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/slices/partySlice.ts"),
      ]);
      store.dispatch(actions.toggleGymBadge("cascade"));
      await persistor.flush();
      return JSON.parse(JSON.stringify(store.getState().party));
    });
    await gateway.publish();
    await pause(400);
    const afterEnvelope = await partyState(playerA);
    assert.equal(afterEnvelope.pvpLock, null);
    assert.equal(
      afterEnvelope.pvpRevision,
      afterPlay.pvpRevision,
      "Finalized presence replays must not relock the party",
    );
    assert.equal(afterEnvelope.bag.money, 500);
    assert.ok(afterEnvelope.bag.badges.includes("cascade"));
    // A reconnect can replay the immutable finalized envelope; the receipt must
    // prevent a second application and a stale party must not restore old HP.
    await cdp.request("Page.reload", {}, playerA);
    await waitArgs(
      playerA,
      () => !!document.querySelector('a[href="/mensajes-prueba"]'),
      "released player can reload normally",
    );
    const replayA = await partyState(playerA);
    assert.equal(replayA.pvpReceipts.length, 1);
    assert.deepEqual(replayA.pokemons, finalA.pokemons);
    // Trainer Battle reuses the same real user reservation and Mongo adapter.
    // The unrelated second player remains free and no synthetic user/socket is needed.
    const trainerOriginal = await seedPvpTeam(playerA, 6, 60, 1.3);
    const unrelatedBefore = await partyState(playerB);
    await clickButton(admin, "Trainer Battle");
    await waitArgs(
      admin,
      () => !!document.querySelector('select[aria-label="Jugador Trainer A"]'),
      "Trainer Battle tab replaces manual mode",
    );
    await field(admin, 'select[aria-label="Categoría Trainer"]', "rival");
    await field(admin, 'select[aria-label="Inicial del jugador"]', "grass");
    await waitArgs(
      admin,
      () =>
        document
          .querySelector('[aria-label="Equipo del Trainer"]')
          ?.textContent.toLowerCase()
          .includes("charmander"),
      "grass starter selects opposing Charmander preset",
    );
    await field(admin, 'select[aria-label="Categoría Trainer"]', "gym");
    await field(admin, 'select[aria-label="Preset Trainer"]', "kanto-brock");
    await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
    await clickButton(admin, "Solicitar equipo y preparar Trainer");
    await waitArgs(
      admin,
      () =>
        [...document.querySelectorAll("button")].some(
          (button) =>
            button.textContent.trim() === "Iniciar Trainer Battle" &&
            !button.disabled,
        ),
      "single player snapshot and Brock preset are ready",
    );
    const trainerBattleId = (await pvpRepository.locked())[0].battleId;
    let trainerBattle = await pvpRepository.get(trainerBattleId);
    assert.equal(trainerBattle.mode, "trainer");
    assert.deepEqual(trainerBattle.lockedUserIds, [2]);
    assert.equal(trainerBattle.players.b, undefined);
    assert.deepEqual(
      trainerBattle.players.a.snapshot.pokemons,
      trainerOriginal.pokemons,
    );
    assert.deepEqual(
      trainerBattle.trainer.team.pokemons.map((capture) => [
        capture.pokemon.id,
        capture.pokemon.level,
        capture.moves.map((move) => move.id),
      ]),
      [
        [74, 12, [33, 111, 300, 317]],
        [95, 14, [33, 20, 106, 317]],
      ],
    );
    assert.equal((await partyState(playerB)).pvpLock, null);
    await waitArgs(
      playerA,
      () =>
        document.body.innerText.includes("Brock") &&
        !!document.querySelector('[data-testid="pvp-party-lock"]'),
      "player sees Trainer reservation",
    );
    await evalArgs(playerA, async () => {
      const [{ store }, actions] = await Promise.all([
        import("/src/store/store.ts"),
        import("/src/slices/partySlice.ts"),
      ]);
      const before = JSON.stringify(store.getState().party);
      store.dispatch(actions.resetGame());
      store.dispatch(actions.changeBagMoney({ amount: 999, direction: "add" }));
      if (JSON.stringify(store.getState().party) !== before)
        throw new Error("Trainer reservation allowed a party mutation");
    });
    await clickButton(admin, "Iniciar Trainer Battle");
    await waitArgs(
      admin,
      () => !!document.querySelector('[aria-label="NPC Brock"]'),
      "NPC has automatic controls",
    );
    assert.equal(
      await evalArgs(
        admin,
        () =>
          document.querySelectorAll('section[aria-label^="Controles de"]')
            .length,
      ),
      1,
    );
    trainerBattle = await pvpRepository.get(trainerBattleId);
    const trainerSerial = trainerBattle.session.runtime.serial;
    await cdp.request("Page.navigate", { url: "about:blank" }, playerA);
    for (const socket of gateway.namespace.sockets.values())
      if (socket.data.identity?.user.id === 2) socket.disconnect(true);
    await waitArgs(
      admin,
      () => document.body.innerText.includes("Combate en pausa"),
      "Trainer battle pauses for its sole player",
    );
    assert.equal(
      (await pvpRepository.get(trainerBattleId)).session.runtime.serial,
      trainerSerial,
    );
    await cdp.request(
      "Page.navigate",
      { url: frontendUrl + "/dashboard" },
      playerA,
    );
    await waitArgs(
      playerA,
      () => !!document.querySelector('[data-testid="pvp-party-lock"]'),
      "Trainer reservation survives player reconnect",
    );
    await cdp.request("Page.reload", {}, admin);
    await waitArgs(
      admin,
      () =>
        !!document.querySelector('[aria-label="NPC Brock"]') &&
        [...document.querySelectorAll("button[data-move-id]")].some(
          (button) => !button.disabled,
        ),
      "admin reload recovers Trainer tab and checkpoint",
    );
    assert.equal(
      (await pvpRepository.get(trainerBattleId)).session.runtime.serial,
      trainerSerial,
    );
    await evalArgs(admin, () =>
      document.querySelector('button[data-move-id="150"]').click(),
    );
    await waitArgs(
      admin,
      () => !!document.querySelector('[role="dialog"]'),
      "NPC automatically chooses a real action and resolves the turn",
    );
    trainerBattle = await pvpRepository.get(trainerBattleId);
    assert.ok(trainerBattle.session.runtime.turn >= 2);
    assert.ok(
      trainerBattle.session.runtime.requests.b.moves.some(
        (move) => move.pp < move.maxpp,
      ),
    );
    await clickButton(admin, "Volver al combate", "[role=dialog]");
    await waitArgs(
      admin,
      () => !document.querySelector('[role="dialog"]'),
      "close Trainer turn summary",
    );
    await evalArgs(admin, () =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent.trim().startsWith("Rendirse:"))
        .click(),
    );
    await clickButton(admin, "Confirmar rendición", "[role=dialog]");
    await waitArgs(
      admin,
      () => document.body.innerText.includes("¡Victoria de Brock!"),
      "Trainer wins after player forfeit",
    );
    trainerBattle = await pvpRepository.get(trainerBattleId);
    const trainerExpected = trainerBattle.session.teams.a.pokemons;
    assert.deepEqual(
      (await partyState(playerA)).pokemons,
      trainerOriginal.pokemons,
      "Trainer result only applies on exit",
    );
    await waitArgs(
      admin,
      () => !!document.querySelector('[role="dialog"]'),
      "Trainer forfeit summary",
    );
    await clickButton(admin, "Volver al combate", "[role=dialog]");
    await waitArgs(
      admin,
      () => !document.querySelector('[role="dialog"]'),
      "close Trainer forfeit summary",
    );
    await cdp.request("Page.navigate", { url: "about:blank" }, playerA);
    for (const socket of gateway.namespace.sockets.values())
      if (socket.data.identity?.user.id === 2) socket.disconnect(true);
    await clickButton(admin, "Salir y actualizar Party");
    await waitArgs(
      admin,
      () =>
        document.body.innerText.includes("Esperando el guardado del jugador"),
      "offline result remains durable until its sole owner saves",
    );
    trainerBattle = await pvpRepository.get(trainerBattleId);
    assert.equal(trainerBattle.lockHeld, true);
    assert.deepEqual(trainerBattle.applied, { a: false, b: true });
    assert.equal(trainerBattle.results.b, undefined);
    await cdp.request(
      "Page.navigate",
      { url: frontendUrl + "/dashboard" },
      playerA,
    );
    await waitArgs(
      playerA,
      () =>
        !document.querySelector('[data-testid="pvp-party-lock"]') &&
        !!document.querySelector('a[href="/mensajes-prueba"]'),
      "single player saves and releases Trainer reservation",
    );
    trainerBattle = await pvpRepository.get(trainerBattleId);
    assert.equal(trainerBattle.phase, "finalized");
    const trainerFinal = await partyState(playerA);
    assert.deepEqual(trainerFinal.bag, trainerOriginal.bag);
    assert.equal(
      trainerFinal.pvpReceipts.length,
      trainerOriginal.pvpReceipts.length + 1,
    );
    for (const capture of trainerFinal.pokemons) {
      const expected = trainerExpected.find(
        (entry) => entry.captureId === capture.captureId,
      );
      assert.equal(
        capture.pokemon.stats.find((stat) => stat.name === "hp").value,
        expected.pokemon.stats.find((stat) => stat.name === "hp").value,
      );
      assert.deepEqual(capture.statuses, expected.statuses);
      assert.deepEqual(
        capture.moves,
        trainerOriginal.pokemons.find(
          (entry) => entry.captureId === capture.captureId,
        ).moves,
      );
    }
    assert.deepEqual(
      await partyState(playerB),
      unrelatedBefore,
      "NPC result does not change another real account",
    );
    await gateway.publish();
    await pause(300);
    assert.equal(
      (await partyState(playerA)).pvpRevision,
      trainerFinal.pvpRevision,
    );
    // Regression: Sabrina must schedule Future Sight once, use other actions
    // while it is pending, and show its actual delayed damage after a reload.
    await evalArgs(playerA, async () => {
      const [{ store, persistor }, storage, stats, catalog] = await Promise.all(
        [
          import("/src/store/store.ts"),
          import("/src/store/accountStorage.ts"),
          import("/src/lib/pokemonStats.ts"),
          import("/src/lib/trainerBattle/catalog.ts"),
        ],
      );
      const party = JSON.parse(JSON.stringify(store.getState().party));
      const species = catalog.trainerSpecies.find((entry) => entry.id === 143);
      party.pokemons = [
        {
          captureId: crypto.randomUUID(),
          origin: "wild",
          pokemon: stats.createLeveledPokemon(
            {
              id: species.id,
              name: species.name,
              types: species.types,
              image: null,
              stats: species.baseStats,
            },
            species.baseStats,
            100,
            1.3,
          ),
          moves: [catalog.trainerMoves.find((move) => move.id === 150)],
          statuses: [],
          statusTurns: {},
        },
      ];
      store.dispatch({ type: storage.PVP_PARTY_COMMIT, payload: party });
      await persistor.flush();
    });
    await waitArgs(
      admin,
      () => !!document.querySelector('select[aria-label="Jugador Trainer A"]'),
      "Trainer lobby after previous result",
    );
    await field(admin, 'select[aria-label="Jugador Trainer A"]', "2");
    await field(admin, 'select[aria-label="Preset Trainer"]', "kanto-sabrina");
    await clickButton(admin, "Solicitar equipo y preparar Trainer");
    await waitArgs(
      admin,
      () =>
        [...document.querySelectorAll("button")].some(
          (button) =>
            button.textContent.trim() === "Iniciar Trainer Battle" &&
            !button.disabled,
        ),
      "Sabrina ready",
    );
    await evalArgs(admin, () => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (array) => {
        if (array instanceof Uint16Array && array.length === 4) {
          array.set([1, 2, 3, 5]);
          return array;
        }
        return original(array);
      };
    });
    await clickButton(admin, "Iniciar Trainer Battle");
    await waitArgs(
      admin,
      () => !!document.querySelector('[aria-label="NPC Sabrina"]'),
      "automatic Sabrina battle started",
    );
    const sightBattleId = (await pvpRepository.locked())[0].battleId;
    const ownHp = (row) =>
      row.session.teams.a.pokemons[0].pokemon.stats.find(
        (stat) => stat.name === "hp",
      ).value;
    const beforeSightHp = ownHp(await pvpRepository.get(sightBattleId));
    const chooseSplash = async (label) => {
      await waitArgs(
        admin,
        () =>
          [...document.querySelectorAll('button[data-move-id="150"]')].some(
            (button) => !button.disabled,
          ),
        label + " action available",
      );
      await evalArgs(admin, () =>
        document.querySelector('button[data-move-id="150"]').click(),
      );
      await waitArgs(
        admin,
        () => !!document.querySelector('[role="dialog"]'),
        label + " summary",
      );
    };
    const closeSummary = async () => {
      await clickButton(admin, "Volver al combate", "[role=dialog]");
      await waitArgs(
        admin,
        () => !document.querySelector('[role="dialog"]'),
        "close delayed turn summary",
      );
    };
    await chooseSplash("Future Sight cast");
    let sightBattle = await pvpRepository.get(sightBattleId);
    assert.equal(
      ownHp(sightBattle),
      beforeSightHp,
      "Future Sight has no immediate damage",
    );
    assert.equal(
      sightBattle.session.history[0].results.find(
        (result) => result.actorSide === "opponent",
      ).moveId,
      248,
    );
    const sightPp = sightBattle.session.runtime.requests.b.moves.find(
      (move) => move.id === 248,
    ).pp;
    await waitArgs(
      admin,
      () =>
        document
          .querySelector('[role="dialog"]')
          .textContent.includes("Ataque programado"),
      "cast is described as scheduled, not missing damage",
    );
    await closeSummary();
    await cdp.request("Page.reload", {}, admin);
    await waitArgs(
      admin,
      () => !!document.querySelector('[aria-label="NPC Sabrina"]'),
      "Future Sight checkpoint reload",
    );
    await chooseSplash("Future Sight waiting");
    sightBattle = await pvpRepository.get(sightBattleId);
    assert.equal(
      sightBattle.session.runtime.requests.b.moves.find(
        (move) => move.id === 248,
      ).pp,
      sightPp,
      "NPC does not repeat the queued Future Sight",
    );
    await closeSummary();
    const beforeImpactHp = ownHp(sightBattle);
    await chooseSplash("Future Sight impact");
    sightBattle = await pvpRepository.get(sightBattleId);
    const impact = sightBattle.session.history[0].results.find(
      (result) => result.moveId === 248,
    );
    assert.ok(
      impact?.appliedDamage > 0,
      "delayed damage has its own Future Sight result: " +
        JSON.stringify(impact),
    );
    assert.equal(
      sightBattle.session.runtime.requests.b.moves.find(
        (move) => move.id === 248,
      ).pp,
      sightPp,
      "no repeated cast on the impact turn",
    );
    assert.equal(
      beforeImpactHp - ownHp(sightBattle),
      sightBattle.session.history[0].results
        .filter((result) => result.actorSide === "opponent")
        .reduce((sum, result) => sum + result.appliedDamage, 0),
      "summary damage matches the real HP reduction",
    );
    await waitArgs(
      admin,
      () =>
        document
          .querySelector('[role="dialog"]')
          .textContent.includes("Impacto del ataque diferido") &&
        document
          .querySelector('[role="dialog"]')
          .textContent.includes("Future Sight"),
      "Future Sight impact card is visible",
    );
    await closeSummary();
    await evalArgs(admin, () =>
      [...document.querySelectorAll("button")]
        .find((button) => button.textContent.trim().startsWith("Rendirse:"))
        .click(),
    );
    await clickButton(admin, "Confirmar rendición", "[role=dialog]");
    await waitArgs(
      admin,
      () => document.body.innerText.includes("¡Victoria de Sabrina!"),
      "finish delayed move fixture",
    );
    await waitArgs(
      admin,
      () => !!document.querySelector('[role="dialog"]'),
      "Sabrina final summary",
    );
    await closeSummary();
    await clickButton(admin, "Salir y actualizar Party");
    await waitArgs(
      playerA,
      () => !document.querySelector('[data-testid="pvp-party-lock"]'),
      "delayed damage result saves and unlocks the party",
    );
    assert.deepEqual(cdp.exceptions, [], "Unexpected browser exception");
    console.log(
      "PASS: PvP and automatic Kanto Trainers, reservations/recovery/results, and Sabrina Future Sight: delayed HP damage, reload persistence, visible impact and no repeated pending cast.",
    );
  }
} catch (error) {
  console.error("FAIL: " + error.message);
  if (cdp?.exceptions.length)
    console.error("Browser exceptions:", cdp.exceptions);
  process.exitCode = 1;
} finally {
  await cleanup();
}
