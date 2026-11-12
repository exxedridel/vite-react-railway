/** Exercise the actual singleton Redux store entirely in a VM with fake storage. */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pvpMode = process.argv.includes("--pvp");
const shopMode = process.argv.includes("--shop");
const timers = new Set();
let networkCalls = 0;
class FakeStorage {
  data = new Map();
  failWritesFor = new Set();
  readKeys = [];
  writeKeys = [];
  get length() {
    return this.data.size;
  }
  key(index) {
    return [...this.data.keys()][index] ?? null;
  }
  seed(key, value) {
    this.data.set(String(key), String(value));
  }
  getItem(key) {
    this.readKeys.push(key);
    return this.data.get(String(key)) ?? null;
  }
  setItem(key, value) {
    if (this.failWritesFor.has(key))
      throw new Error("Simulated storage quota failure");
    this.writeKeys.push(key);
    this.seed(key, value);
  }
  removeItem(key) {
    this.data.delete(String(key));
  }
  clear() {
    this.data.clear();
  }
}
const storage = new FakeStorage();
const lockQueues = new Map();
const trackedTimeout = (callback, delay, ...args) => {
  const timer = setTimeout(() => {
    timers.delete(timer);
    callback(...args);
  }, delay);
  timers.add(timer);
  return timer;
};
const trackedInterval = (callback, delay, ...args) => {
  const timer = setInterval(callback, delay, ...args);
  timers.add(timer);
  return timer;
};
const clearTimer = (timer) => {
  timers.delete(timer);
  clearTimeout(timer);
  clearInterval(timer);
};
const context = vm.createContext({
  console,
  localStorage: storage,
  testStorage: storage,
  crypto: webcrypto,
  URL,
  TextEncoder,
  TextDecoder,
  AbortController,
  DOMException,
  Request,
  Response,
  Headers,
  structuredClone,
  setTimeout: trackedTimeout,
  clearTimeout: clearTimer,
  setInterval: trackedInterval,
  clearInterval: clearTimer,
  fetch: () => {
    networkCalls += 1;
    throw new Error("Network access is forbidden in account-storage QA");
  },
  navigator: {
    locks: {
      request: (_name, _options, callback) => {
        const next = (lockQueues.get(_name) ?? Promise.resolve()).then(() =>
          callback({ name: _name }),
        );
        lockQueues.set(
          _name,
          next.then(
            () => undefined,
            () => undefined,
          ),
        );
        return next;
      },
    },
  },
  window: { dispatchEvent: () => true },
  CustomEvent: class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options?.detail;
    }
  },
  process: {
    env: { NODE_ENV: "production" },
    nextTick: process.nextTick.bind(process),
  },
});

let deadline;
try {
  const { outputFiles } = await build({
    absWorkingDir: root,
    entryPoints: [
      shopMode
        ? "tests/shop-wallet-entry.ts"
        : pvpMode
          ? "tests/pvp-party-entry.ts"
          : "tests/account-storage-entry.ts",
    ],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "es2020",
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.env": JSON.stringify({
        VITE_BASE_MIDDLEWARE: "http://authentication.test.invalid",
        VITE_BASE_SERVICES: "http://messages.test.invalid",
      }),
    },
    minify: true,
    keepNames: true,
    write: false,
    logLevel: "error",
  });
  const filename = resolve(root, "tests/account-storage-render.cjs");
  const module = { exports: {} };
  const execute = vm.runInContext(
    `(function(exports, require, module, __filename, __dirname) {\n${outputFiles[0].text}\n})`,
    context,
    { filename, timeout: 30000 },
  );
  execute(
    module.exports,
    createRequire(import.meta.url),
    module,
    filename,
    dirname(filename),
  );
  const passed = await Promise.race([
    module.exports.runAccountStorageTests(),
    new Promise((_, reject) => {
      deadline = setTimeout(
        () => reject(new Error("Account-storage QA timed out")),
        30000,
      );
    }),
  ]);
  assert.equal(
    networkCalls,
    0,
    "The test must never contact an API or database",
  );
  for (const description of passed) console.log(`PASS: ${description}`);
  console.log(
    `${shopMode ? "Shop wallet" : pvpMode ? "PvP party" : "Account storage"}: ${passed.length} integration cases passed; fake storage only, zero network requests.`,
  );
} catch (error) {
  console.error(`${error.name}: ${error.message}`);
  console.error(
    String(error.stack ?? "")
      .split("\n")
      .filter((line) => line.trimStart().startsWith("at "))
      .slice(-5)
      .join("\n"),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  for (const timer of timers) clearTimer(timer);
}
