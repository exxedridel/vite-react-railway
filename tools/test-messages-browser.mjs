/** Real Chrome + Vite + isolated Nest MessagesModule. No database or real credentials. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nestRoot = resolve(root, "../nest-mongo-pokedex");
const require = createRequire(join(root, "package.json"));
const requireNest = createRequire(join(nestRoot, "package.json"));
const WebSocket = require("ws");
const { sign } = requireNest("jsonwebtoken");
const TEST_SECRET = "pokemon-browser-test-only-secret-no-production-use";
const accounts = ["najerad2223@gmail.com", "hevedrios@gmail.com"];
const pause = (ms) => new Promise((resolvePause) => setTimeout(resolvePause, ms));

async function bounded(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), milliseconds);
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
          (detail.exception?.description ?? detail.text ?? "Browser exception").slice(0, 500),
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
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  async evaluate(sessionId, expression) {
    const result = await this.request("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId);
    if (result.exceptionDetails)
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }

  async waitFor(sessionId, expression, label, milliseconds = 30000) {
    const deadline = Date.now() + milliseconds;
    do {
      if (await this.evaluate(sessionId, expression)) return;
      await pause(150);
    } while (Date.now() < deadline);
    const page = await this.evaluate(sessionId, "document.body?.innerText?.slice(0, 1800)");
    throw new Error(`Timeout: ${label}. Page: ${page}`);
  }
}

let app;
let vite;
let chrome;
let cdp;
let profile;
let cleanupPromise;
const savedEnvironment = new Map(
  ["JWT_SECRET", "FRONTEND_ORIGINS", "VITE_WEBSOCKET_URL", "VITE_BASE_SERVICES", "VITE_BASE_MIDDLEWARE"].map((key) => [key, process.env[key]]),
);

function cleanup() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    if (cdp) {
      await bounded(cdp.request("Browser.close"), 3000, "closing Chrome").catch(() => {});
      cdp.socket.close();
    }
    if (chrome && chrome.exitCode === null) {
      await bounded(once(chrome, "exit"), 4000, "Chrome exit").catch(() => {});
      if (chrome.exitCode === null) {
        if (process.platform === "win32") {
          // Only the browser process created by this script and its children are stopped.
          const killer = spawn("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
          await bounded(once(killer, "exit"), 4000, "stopping test Chrome").catch(() => {});
        } else chrome.kill("SIGKILL");
      }
    }
    if (vite) await bounded(vite.close(), 5000, "closing Vite").catch(() => {});
    if (app) await bounded(app.close(), 5000, "closing Nest").catch(() => {});
    if (profile) {
      const checkedProfile = resolve(profile);
      // Recursive cleanup is restricted to the fresh temporary profile we created.
      assert.equal(dirname(checkedProfile), resolve(tmpdir()));
      assert.ok(basename(checkedProfile).startsWith("pokemon-messages-browser-"));
      await rm(checkedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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

async function openAccount(email, id, frontendUrl) {
  const { browserContextId } = await cdp.request("Target.createBrowserContext", {
    disposeOnDetach: true,
  });
  const { targetId } = await cdp.request("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.request("Target.attachToTarget", { targetId, flatten: true });
  await cdp.request("Page.enable", {}, sessionId);
  await cdp.request("Runtime.enable", {}, sessionId);
  const token = sign({ id, email, first_name: "Browser", last_name: "Test" }, TEST_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
  await cdp.request("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem("bearer_token", ${JSON.stringify(token)}); localStorage.setItem("vite-ui-theme", "light");`,
  }, sessionId);
  await cdp.request("Page.navigate", { url: `${frontendUrl}/mensajes-prueba` }, sessionId);
  return sessionId;
}

async function sendFromPage(sessionId, text) {
  await cdp.evaluate(sessionId, `(() => {
    const field = document.querySelector("#test-message");
    if (!field) throw new Error("Message textarea missing");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(field, ${JSON.stringify(text)});
    field.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await cdp.waitFor(sessionId, '!document.querySelector("button[type=submit]")?.disabled', "enabled send button");
  await cdp.evaluate(sessionId, 'document.querySelector("button[type=submit]").click()');
}

async function expectMessages(sessionId, expected) {
  await cdp.waitFor(sessionId, `(() => {
    const articles = [...document.querySelectorAll('[role="log"] article')];
    const texts = articles.map(article => article.querySelectorAll("p")[1]?.textContent);
    return JSON.stringify(texts) === ${JSON.stringify(JSON.stringify(expected))};
  })()`, `${expected.length} messages without duplicates`);
}

try {
  console.log("Browser QA: starting isolated Nest MessagesModule and local Vite…");
  process.env.JWT_SECRET = TEST_SECRET;
  requireNest("reflect-metadata");
  const { NestFactory } = requireNest("@nestjs/core");
  const { Module } = requireNest("@nestjs/common");
  let MessagesModule;
  try {
    ({ MessagesModule } = requireNest(join(nestRoot, "dist/messages/messages.module.js")));
  } catch (error) {
    throw new Error(`Build nest-mongo-pokedex before browser QA: ${error.message}`);
  }
  class BrowserMessagesRoot {}
  Module({ imports: [MessagesModule] })(BrowserMessagesRoot);
  app = await bounded(NestFactory.create(BrowserMessagesRoot, { logger: false }), 10000, "Nest startup");
  await bounded(app.listen(0, "127.0.0.1"), 10000, "Nest listen");
  const backendUrl = await app.getUrl();
  process.env.VITE_WEBSOCKET_URL = backendUrl;
  process.env.VITE_BASE_SERVICES = backendUrl;
  process.env.VITE_BASE_MIDDLEWARE = backendUrl;
  vite = await bounded(createServer({
    root,
    envFile: false,
    define: {
      "import.meta.env.VITE_WEBSOCKET_URL": JSON.stringify(backendUrl),
      "import.meta.env.VITE_BASE_SERVICES": JSON.stringify(backendUrl),
      "import.meta.env.VITE_BASE_MIDDLEWARE": JSON.stringify(backendUrl),
    },
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  }), 15000, "Vite startup");
  await bounded(vite.listen(), 10000, "Vite listen");
  const frontendUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  process.env.FRONTEND_ORIGINS = frontendUrl;

  profile = await mkdtemp(join(tmpdir(), "pokemon-messages-browser-"));
  const chromePath = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
  chrome = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const debuggerUrl = await bounded(new Promise((resolveDebugger, reject) => {
    let stderr = "";
    chrome.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-12000);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) resolveDebugger(match[1]);
    });
    chrome.once("error", reject);
    chrome.once("exit", (code) => reject(new Error(`Chrome exited before DevTools was ready (${code}).`)));
  }), 15000, "Chrome DevTools startup");
  const websocket = new WebSocket(debuggerUrl);
  await bounded(once(websocket, "open"), 10000, "DevTools WebSocket");
  cdp = new ChromeConnection(websocket);
  const admin = await openAccount(accounts[0], "qa-admin", frontendUrl);
  const player = await openAccount(accounts[1], "qa-player", frontendUrl);
  const connectedExpression = 'document.body.innerText.includes("Conectado con Nest") && document.body.innerText.includes("Destinatario conectado") && !!document.querySelector("#test-message")';
  await Promise.all([admin, player].map((session) => cdp.waitFor(session, connectedExpression, "both accounts connected on the real messages route", 45000)));
  console.log("Browser QA: both accounts connected, including the administrator's separate route.");
  await expectMessages(admin, []);
  await expectMessages(player, []);

  const adminText = '<img src=x onerror="window.__messagesXss=true"> prueba admin → jugador';
  const playerText = "Respuesta del jugador al administrador";
  await sendFromPage(admin, adminText);
  await Promise.all([admin, player].map((session) => expectMessages(session, [adminText])));
  await cdp.waitFor(admin, 'document.querySelector("#test-message").value === ""', "ACK clears accepted draft");
  await sendFromPage(player, playerText);
  await Promise.all([admin, player].map((session) => expectMessages(session, [adminText, playerText])));
  await pause(500);
  for (const session of [admin, player]) {
    await expectMessages(session, [adminText, playerText]);
    assert.equal(await cdp.evaluate(session, `document.querySelectorAll('[role="log"] img').length`), 0);
    assert.equal(await cdp.evaluate(session, "window.__messagesXss === undefined"), true);
  }
  console.log("Browser QA: bidirectional delivery, ACK/echo deduplication and literal HTML text passed.");

  await cdp.request("Page.reload", {}, player);
  await cdp.waitFor(player, connectedExpression, "player reconnect after reload");
  await expectMessages(player, []);
  await expectMessages(admin, [adminText, playerText]);
  const afterReloadText = "Mensaje después de recargar";
  await sendFromPage(player, afterReloadText);
  await expectMessages(player, [afterReloadText]);
  await expectMessages(admin, [adminText, playerText, afterReloadText]);

  await cdp.evaluate(player, `document.querySelector('a[href="/dashboard"]').click()`);
  await cdp.waitFor(player, `location.pathname === "/dashboard" && !!document.querySelector('a[href="/mensajes-prueba"]')`, "player navbar messages link");
  await cdp.waitFor(admin, 'document.body.innerText.includes("Destinatario desconectado")', "socket cleanup after leaving messages");
  await cdp.evaluate(admin, `document.querySelector('a[href="/dashboard"]').click()`);
  await cdp.waitFor(admin, `location.pathname === "/dashboard" && !!document.querySelector('nav[aria-label="Paneles del administrador"] a[href="/mensajes-prueba"]')`, "admin workspace messages link");
  for (const session of [admin, player])
    await cdp.evaluate(session, `document.querySelector('a[href="/mensajes-prueba"]').click()`);
  await Promise.all([admin, player].map((session) => cdp.waitFor(session, connectedExpression, "reconnect through dashboard links")));
  await Promise.all([admin, player].map((session) => expectMessages(session, [])));
  assert.deepEqual(cdp.exceptions, [], "Unexpected browser exceptions");
  console.log("PASS: real Chrome, two isolated accounts, messages route, bidirectional text, dedup, HTML safety, reload, navigation links and socket cleanup. No database or real credentials used.");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  if (cdp?.exceptions.length) console.error("Browser exceptions:", cdp.exceptions);
  process.exitCode = 1;
} finally {
  await cleanup();
}
