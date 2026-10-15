/** Repère les textes JSX oubliés et les clés explicites absentes du dictionnaire anglais. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "../../frontend/node_modules/typescript/lib/typescript.js";

/** Racine frontend indépendante du dossier depuis lequel la commande est lancée. */
const root = new URL("../../frontend/src/", import.meta.url);
/** Exceptions visibles : marque, noms natifs des langues et symbole de fermeture HTML. */
const literalExceptions = new Set([
  "FT Music",
  "Français",
  "English",
  "Español",
  "&times;",
]);
/** Clés de traduction déclarées, extraites sans charger le code de l'application. */
const keys = new Set();
const dictionary = ts.createSourceFile(
  "en.ts",
  await readFile(new URL("translations/en.ts", root), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
/** Lit uniquement les noms des propriétés du dictionnaire. */
function collect(node) {
  if (
    ts.isPropertyAssignment(node) &&
    (ts.isStringLiteral(node.name) || ts.isIdentifier(node.name))
  )
    keys.add(node.name.text);
  ts.forEachChild(node, collect);
}
collect(dictionary);
/** Liste exacte des fichiers visuels à contrôler, y compris les composants actuellement moins utilisés. */
const files = ["App.tsx"];
for (const directory of ["pages", "components"])
  for (const name of await readdir(new URL(directory + "/", root)))
    if (name.endsWith(".tsx")) files.push(directory + "/" + name);
/** Erreurs regroupées pour corriger tous les oublis en une lecture. */
const failures = [];
for (const file of files) {
  const source = ts.createSourceFile(
    file,
    await readFile(new URL(file, root), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  /** Signale un texte littéral non traduit, sans prendre les données utilisateur pour du texte applicatif. */
  function check(node) {
    let literal;
    if (ts.isJsxText(node)) literal = node.text.trim();
    if (
      ts.isJsxAttribute(node) &&
      ["alt", "title", "placeholder", "aria-label", "aria-valuetext"].includes(
        node.name.getText(source),
      ) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    )
      literal = node.initializer.text;
    if (literal && /[a-zA-Z]/.test(literal) && !literalExceptions.has(literal))
      failures.push(`${file}: untranslated ${JSON.stringify(literal)}`);
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === "t" &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      !keys.has(node.arguments[0].text)
    )
      failures.push(`${file}: missing key ${node.arguments[0].text}`);
    ts.forEachChild(node, check);
  }
  check(source);
}
assert.deepEqual(failures, [], fileURLToPath(root));
console.log(
  `[LANGUAGE COVERAGE] PASS ${files.length} visual files, ${keys.size} dictionary keys; dynamic messages covered separately`,
);
