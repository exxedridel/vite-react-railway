import { build } from "esbuild";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { outputFiles } = await build({
  absWorkingDir: root,
  entryPoints: ["tests/trainer-privacy-entry.tsx"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2020",
  jsx: "automatic",
  tsconfig: resolve(root, "tools/trainer-privacy.tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "empty" },
  minify: true,
  keepNames: true,
  write: false,
  logLevel: "error",
});
const filename = resolve(root, "tests/trainer-privacy-render.cjs");
const module = { exports: {} };
try {
  const execute = vm.runInThisContext(
    [
      "(function(exports, require, module, __filename, __dirname) {",
      outputFiles[0].text,
      "})",
    ].join(String.fromCharCode(10)),
    { filename, timeout: 30000 },
  );
  execute(
    module.exports,
    createRequire(import.meta.url),
    module,
    filename,
    dirname(filename),
  );
  console.log(
    "PASS: production TrainerBattleView DOM keeps pending moves, switches and items private on both sides; JSON reload and cancellation",
    module.exports.trainerPrivacySmoke,
  );
} catch (error) {
  console.error(`${error.name}: ${error.message}`.slice(0, 1600));
  console.error(
    String(error.stack ?? "")
      .split("\n")
      .filter((line) => line.trimStart().startsWith("at "))
      .slice(-6)
      .join("\n"),
  );
  process.exitCode = 1;
}
