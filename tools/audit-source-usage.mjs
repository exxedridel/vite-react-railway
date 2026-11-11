/** Read-only import graph; include tests/tools so useful game fixtures are retained. */
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(file) && !file.endsWith(".d.ts"))
      files.push(file);
  }
}
for (const dir of ["src", "tests", "tools"]) walk(path.join(root, dir));
const known = new Set(files),
  edges = new Map();
// Keep both candidates if TS and Vite extension precedence can differ.
const extensions = [
  "",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".mjs",
  ".mts",
  ".json",
  "/index.js",
  "/index.ts",
  "/index.tsx",
  "/index.jsx",
];
function resolve(specifier, from) {
  let base;
  if (specifier.startsWith("@/"))
    base = path.join(root, "src", specifier.slice(2));
  else if (specifier.startsWith("/src/"))
    base = path.join(root, specifier.slice(1));
  else if (specifier.startsWith("."))
    base = path.resolve(path.dirname(from), specifier);
  else return [];
  return extensions
    .map((extension) => path.normalize(base + extension))
    .filter((file) => known.has(file));
}
for (const file of files) {
  const tree = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const dependencies = [];
  function visit(node) {
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifier = node.moduleSpecifier.text;
    else if (
      ts.isCallExpression(node) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    )
      specifier = node.arguments[0].text;
    if (specifier) dependencies.push(...resolve(specifier, file));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  edges.set(file, dependencies);
}
function reachable(roots) {
  const found = new Set(),
    pending = [...roots];
  while (pending.length) {
    const file = pending.pop();
    if (found.has(file)) continue;
    found.add(file);
    pending.push(...(edges.get(file) ?? []));
  }
  return found;
}
const sourceRoot = path.join(root, "src") + path.sep;
const production = reachable([path.join(root, "src/main.jsx")]);
const required = reachable([
  path.join(root, "src/main.jsx"),
  ...files.filter((file) => !file.startsWith(sourceRoot)),
]);
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
console.log(
  JSON.stringify(
    {
      productionModules: production.size,
      unreachableSources: files
        .filter((file) => file.startsWith(sourceRoot) && !required.has(file))
        .map(relative),
      sourcesOnlyForTests: files
        .filter(
          (file) =>
            file.startsWith(sourceRoot) &&
            required.has(file) &&
            !production.has(file),
        )
        .map(relative),
    },
    null,
    2,
  ),
);
