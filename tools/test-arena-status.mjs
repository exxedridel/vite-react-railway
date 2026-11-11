/** Run the actual arena/status React tests in Node, without CSS or browser I/O. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { outputFiles } = await build({
  absWorkingDir: root,
  entryPoints: ["tests/arena-status.test.tsx"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  jsx: "automatic",
  define: {
    "process.env.NODE_ENV": '"test"',
    "import.meta.env": JSON.stringify({ BASE_URL: "/" }),
  },
  loader: { ".css": "empty" },
  write: false,
  logLevel: "error",
});

const storage = new Map([["pokemon-battle-music-enabled", "false"]]);
const documentListeners = new Map();
let networkRequests = 0;
const sandbox = vm.createContext({
  console,
  process,
  Buffer,
  TextEncoder,
  TextDecoder,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  queueMicrotask,
  document: {
    // Some UI packages inject a stylesheet at import time. The tests inspect
    // React trees, so these inert stylesheet nodes need no browser renderer.
    head: { appendChild() {} },
    createElement: () => ({ type: "", appendChild() {}, setAttribute() {} }),
    createTextNode: (text) => ({ textContent: text }),
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, new Set());
      documentListeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      documentListeners.get(type)?.delete(listener);
    },
  },
  localStorage: {
    getItem: (key) => storage.get(String(key)) ?? null,
    setItem: (key, value) => storage.set(String(key), String(value)),
    removeItem: (key) => storage.delete(String(key)),
  },
  fetch() {
    networkRequests++;
    throw new Error("Network access is forbidden in arena/status tests.");
  },
});

const filename = resolve(root, "tests/arena-status-render.cjs");
const module = { exports: {} };
const execute = vm.runInContext(
  `(function(exports, require, module, __filename, __dirname) {\n${outputFiles[0].text}\n})`,
  sandbox,
  { filename, timeout: 30000 },
);
execute(
  module.exports,
  createRequire(import.meta.url),
  module,
  filename,
  dirname(filename),
);

after(() => {
  assert.equal(
    networkRequests,
    0,
    "Arena/status tests must not call external services.",
  );
  for (const listeners of documentListeners.values()) {
    assert.equal(
      listeners.size,
      0,
      "The real music provider must clean up its event listeners.",
    );
  }
});
