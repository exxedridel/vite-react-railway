/** Real Chrome UI + MySQL identity app (memory repository) + isolated Nest relay. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nestRoot = resolve(root, "../nest-mongo-pokedex");
const mysqlRoot = resolve(root, "../mysql-restapi");
const require = createRequire(join(root, "package.json"));
const requireNest = createRequire(join(nestRoot, "package.json"));
const requireMysql = createRequire(join(mysqlRoot, "package.json"));
const WebSocket = require("ws");
const bcrypt = requireMysql("bcryptjs");
const TEST_SECRET = "pokemon-users-browser-test-only-secret-no-production-use";
const TEST_PASSWORD = "Browser-fixture-password-123";
const ADMIN_EMAIL = "qa-admin@example.test";
const OTHER_EMAIL = "qa-observer@example.test";
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
      source: 'localStorage.setItem("vite-ui-theme", "light");',
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
      email: "qa-player@example.test",
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
    const server = authApp.listen(0, "127.0.0.1", () => resolveListen(server));
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
  Module({ imports: [MessagesModule] })(BrowserUsersRoot);
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
  await cdp.evaluate(
    admin,
    `document.querySelector('a[href="/users"]').click()`,
  );
  await cdp.waitFor(
    admin,
    'location.pathname === "/users" && !!document.querySelector("table")',
    "admin users list",
  );
  await clickButton(admin, "Crear usuario");
  await userDialog(admin, {
    "#user-email": NEW_EMAIL,
    "#user-first-name": "Created",
    "#user-last-name": "Player",
    "#user-password": TEST_PASSWORD,
  });
  await cdp.waitFor(
    admin,
    `!!document.querySelector('[aria-label="Editar ${NEW_EMAIL}"]')`,
    "created user row",
  );
  await clickLabel(admin, `Editar ${NEW_EMAIL}`);
  await userDialog(admin, {
    "#user-email": EDITED_EMAIL,
    "#user-first-name": "Edited",
  });
  await cdp.waitFor(
    admin,
    `!!document.querySelector('[aria-label="Editar ${EDITED_EMAIL}"]')`,
    "edited user row",
  );
  const created = await repository.findByEmail(EDITED_EMAIL);
  assert.ok(
    created && created.first_name === "Edited" && created.role === "player",
  );
  console.log(
    "Browser QA: administrator created and edited a user through the real UI.",
  );

  const player = await openAccount(EDITED_EMAIL, frontendUrl);
  const identityProfile = await api(player, authUrl, "/auth/me");
  assert.equal(identityProfile.status, 200);
  assert.equal(identityProfile.body.user.id, created.id);
  assert.equal(identityProfile.body.user.email, EDITED_EMAIL);
  assert.deepEqual(Object.keys(identityProfile.body.user).sort(), [
    "email",
    "first_name",
    "id",
    "last_name",
    "role",
  ]);
  assert.equal((await api(player, authUrl, "/users")).status, 403);
  assert.equal(
    (
      await api(player, authUrl, "/users", "POST", {
        email: "forbidden@example.test",
      })
    ).status,
    403,
  );
  await navigate(player, frontendUrl, "/users");
  await cdp.waitFor(
    player,
    'document.body.innerText.includes("Acceso reservado al administrador")',
    "player denied users UI",
  );
  assert.equal(
    await cdp.evaluate(player, '!!document.querySelector("table")'),
    false,
  );
  console.log(
    "Browser QA: new account logged in through MySQL app; player management access denied in UI and HTTP.",
  );

  const observer = await openAccount(OTHER_EMAIL, frontendUrl);
  for (const session of [admin, player, observer])
    await navigate(session, frontendUrl, "/mensajes-prueba");
  await chooseRecipient(admin, created.id);
  await chooseRecipient(player, 1);
  await chooseRecipient(observer, 1);
  const adminText =
    '<img src=x onerror="window.__messagesXss=true"> private admin to new account';
  const playerText = "Private reply from the newly created account";
  await sendFromPage(admin, adminText);
  for (const session of [admin, player])
    await expectMessages(session, [adminText]);
  await cdp.waitFor(
    admin,
    'document.querySelector("#test-message").value === ""',
    "accepted message clears draft",
  );
  await sendFromPage(player, playerText);
  for (const session of [admin, player])
    await expectMessages(session, [adminText, playerText]);
  await expectMessages(observer, []);
  for (const session of [admin, player]) {
    assert.equal(
      await cdp.evaluate(
        session,
        'document.querySelectorAll("[role=log] img").length',
      ),
      0,
    );
    assert.equal(
      await cdp.evaluate(session, "window.__messagesXss === undefined"),
      true,
    );
  }
  console.log(
    "Browser QA: dynamic contacts, private bidirectional messages, ACK dedup and literal HTML passed; third user receives no conversation.",
  );

  await navigate(admin, frontendUrl, "/users");
  await cdp.waitFor(
    admin,
    `!!document.querySelector('[aria-label="Eliminar ${EDITED_EMAIL}"]')`,
    "delete action",
  );
  await clickLabel(admin, `Eliminar ${EDITED_EMAIL}`);
  await cdp.waitFor(
    admin,
    '!!document.querySelector("[role=dialog]")',
    "delete confirmation",
  );
  await clickButton(admin, "Eliminar usuario", "[role=dialog]");
  await cdp.waitFor(
    admin,
    `!document.querySelector('[role="dialog"]') && !document.querySelector('[aria-label="Eliminar ${EDITED_EMAIL}"]')`,
    "deleted user row",
  );
  assert.equal(await repository.findById(created.id), null);
  assert.equal((await api(player, authUrl, "/auth/me")).status, 401);
  await sendFromPage(player, "This revoked session must not send");
  await cdp.waitFor(
    player,
    '!document.body.innerText.includes("Conectado con Nest")',
    "deleted account disconnected or rejected",
  );
  await expectMessages(observer, []);
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exceptions");
  console.log(
    "PASS: real Chrome UI login, admin create/edit/delete, public identity, player 403, dynamic private messages, third-user privacy and deleted-session rejection. No real database or deployed credentials used.",
  );
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  if (cdp?.exceptions.length)
    console.error("Browser exceptions:", cdp.exceptions);
  process.exitCode = 1;
} finally {
  await cleanup();
}
