/** Vérifie les règles de sélection et la conservation du choix sans stockage disponible. */
import assert from "node:assert/strict";
import test from "node:test";
import { resolveLanguage, setLanguage, getLanguage, subscribeLanguage } from "./language.ts";
/** La préférence explicite précède les langues du navigateur. */
test("saved language takes precedence", () => {
  assert.equal(resolveLanguage("es", ["fr-FR", "en"]), "es");
});
/** Les variantes régionales et l'ordre des préférences sont respectés. */
test("browser language variants and fallback", () => {
  assert.equal(resolveLanguage(null, ["de", "fr-CA", "es"]), "fr");
  assert.equal(resolveLanguage("invalid", ["es-MX"]), "es");
  assert.equal(resolveLanguage(null, ["pt-BR"]), "en");
  assert.equal(resolveLanguage(null, []), "en");
});
/** Un stockage refusé n'empêche ni le changement ni sa notification. */
test("language works with unavailable storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  let notifications = 0;
  const unsubscribe = subscribeLanguage(() => { notifications++; });
  try {
    setLanguage("fr");
    assert.equal(getLanguage(), "fr");
    assert.equal(notifications, 1);
    unsubscribe();
    setLanguage("es");
    assert.equal(notifications, 1);
  } finally {
    unsubscribe();
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
    setLanguage("en");
  }
});
