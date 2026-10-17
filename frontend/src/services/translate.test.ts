/** Vérifie les traductions livrées, les paramètres et les messages conservés entre changements de langue. */
import assert from "node:assert/strict";
import test from "node:test";
import { en } from "../translations/en.ts";
import { fr } from "../translations/fr.ts";
import { es } from "../translations/es.ts";
import { setLanguage } from "./language.ts";
import {
  translate,
  translateError,
  translateCount,
  formatDate,
  formatNumber,
} from "./translate.ts";
/** Chaque traduction garde tous les paramètres du texte anglais, sans ajouter de clé étrangère. */
test("all dictionaries have matching keys and placeholders", () => {
  const keys = Object.keys(en).sort();
  for (const dictionary of [fr, es]) {
    assert.deepEqual(Object.keys(dictionary).sort(), keys);
    for (const key of keys as (keyof typeof en)[]) {
      assert.ok(dictionary[key].trim(), key);
      assert.deepEqual(
        dictionary[key].match(/\{\w+\}/g)?.sort(),
        en[key].match(/\{\w+\}/g)?.sort(),
        key,
      );
    }
  }
});
/** Les titres restent des données, même lorsqu'ils ressemblent à une clé ou à du HTML. */
test("interpolation preserves user content", () => {
  assert.equal(
    translate("Artwork for {0}", { "0": "History <script>" }, "fr"),
    "Visuel de History <script>",
  );
  assert.equal(translate("__proto__", {}, "fr"), "__proto__");
});
/** Une erreur déjà affichée suit la langue sans stocker une version traduite dans le composant. */
test("stored errors and variable notices follow language changes", () => {
  try {
    setLanguage("fr");
    assert.equal(
      translateError("invalid credentials"),
      "E-mail ou mot de passe incorrect.",
    );
    assert.equal(translateError("Added to History."), "Ajouté à History.");
    assert.equal(
      translateError(
        "Your registration is still in progress. Try again in 5 seconds.",
      ),
      "Votre inscription est en cours. Réessayez dans 5 secondes.",
    );
    setLanguage("es");
    assert.equal(
      translateError("invalid credentials"),
      "Correo o contraseña incorrectos.",
    );
    assert.equal(
      translateError("private server trace"),
      "Se ha producido un error inesperado.",
    );
    assert.equal(
      translateError("Playlist saved · private."),
      "Lista guardada · Privada.",
    );
  } finally {
    setLanguage("en");
  }
});
/** Les quantités et dates utilisent la langue de l'application, indépendamment de celle du système. */
test("counts and formats follow selected language", () => {
  try {
    setLanguage("fr");
    assert.equal(translateCount(1, "track"), "1 morceau");
    assert.equal(translateCount(2, "track"), "2 morceaux");
    assert.equal(translateCount(0, "friend"), "0 ami");
    assert.equal(formatNumber(5000), new Intl.NumberFormat("fr").format(5000));
    assert.equal(formatDate("2026-10-15"), "15 oct. 2026");
    assert.equal(formatDate(null), "—");
    setLanguage("es");
    assert.equal(translateCount(0, "friend"), "0 amigos");
    assert.equal(translateCount(1, "second"), "1 segundo");
    setLanguage("en");
    assert.equal(translateCount(2, "track"), "2 tracks");
  } finally {
    setLanguage("en");
  }
});
