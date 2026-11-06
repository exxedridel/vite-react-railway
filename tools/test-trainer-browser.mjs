import { build } from "esbuild";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const { outputFiles } = await build({
  entryPoints: ["tests/trainer-browser-entry.ts"],
  bundle: true,
  target: "es2020",
  platform: "browser",
  format: "iife",
  minify: true,
  keepNames: true,
  write: false,
  logLevel: "error",
});
const context = vm.createContext({
  console,
  crypto: webcrypto,
  TextEncoder,
  TextDecoder,
  URL,
  setTimeout,
  clearTimeout,
});
vm.runInContext(outputFiles[0].text, context, { timeout: 30000 });
console.log(
  "PASS: minified trainer browser bundle; reload, both parties, switching and queued Full restore",
  context.trainerBrowserSmoke,
);
