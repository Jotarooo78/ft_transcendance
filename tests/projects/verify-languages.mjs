/** Vérifie les trois langues avec de vrais comptes, fichiers, publications et lectures sur la pile jetable. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  chromium,
  expect,
} from "../files/node_modules/@playwright/test/index.mjs";

/** Origine fixe, indépendante de la pile de développement. */
const base = "https://127.0.0.1:5445";
/** Mot de passe public réservé aux comptes jetables du test. */
const password = "Languages-test-only-password-2026";
/** Libellés témoins indépendants des dictionnaires de production. */
const labels = {
  en: {
    heading: "Create your account",
    username: "Username",
    display: "Display name",
    email: "Email",
    password: "Password",
    confirm: "Confirm password",
    create: "Create account",
    login: "Login",
    submit: "Log in",
    invalid: "invalid credentials",
    required: "Please fill in this field.",
    profile: "Profile",
    edit: "Edit profile",
    save: "Save changes",
    library: "Library",
    empty:
      "Nothing saved here yet. Explore the catalogue to add something you love.",
    playlists: "My playlists",
    startPlaylist: "Create a playlist",
    editPlaylist: "Edit playlist",
    description: "Description",
    cancel: "Cancel",
    searchPlaylists: "Search playlists",
    sortPlaylists: "Sort playlists",
    artwork: "Cover image",
    invalidArtwork: "Choose a PNG, JPEG or WebP image up to 25 MB.",
    addTracks: "Add tracks",
    addSelection: "Add selection (1)",
    duplicateConfirmation: "Already present (1 track):",
    name: "Name",
    createPlaylist: "Create playlist",
    created: "Playlist created.",
    catalog: "Catalog",
    search: "Search music",
    noTracks: "No tracks found.",
    history: "History",
    historyHeading: "Recently played",
    users: "Users",
    community: "Community",
    upload: "Upload",
    files: "Audio files",
    title: "Project title",
    publish: "Publish",
    published: "Your project is published.",
    view: "View in catalogue",
    play: "Play project",
    logout: "Log out",
    missing: "This item is no longer available.",
  },
  fr: {
    heading: "Créez votre compte",
    username: "Nom d’utilisateur",
    display: "Nom affiché",
    email: "E-mail",
    password: "Mot de passe",
    confirm: "Confirmer le mot de passe",
    create: "Créer un compte",
    login: "Connexion",
    submit: "Se connecter",
    invalid: "E-mail ou mot de passe incorrect.",
    required: "Veuillez remplir ce champ.",
    profile: "Profil",
    edit: "Modifier le profil",
    save: "Enregistrer les modifications",
    library: "Bibliothèque",
    empty:
      "Rien n’est encore enregistré ici. Explorez le catalogue pour ajouter vos coups de cœur.",
    playlists: "Mes playlists",
    startPlaylist: "Créer une playlist",
    editPlaylist: "Modifier la playlist",
    description: "Description",
    cancel: "Annuler",
    searchPlaylists: "Rechercher des playlists",
    sortPlaylists: "Trier les playlists",
    artwork: "Image de pochette",
    invalidArtwork: "Choisissez une image PNG, JPEG ou WebP de 25 Mo maximum.",
    addTracks: "Ajouter des morceaux",
    addSelection: "Ajouter la sélection (1)",
    duplicateConfirmation: "Déjà dans la playlist (1 morceau) :",
    name: "Nom",
    createPlaylist: "Créer la playlist",
    created: "Playlist créée.",
    catalog: "Catalogue",
    search: "Rechercher de la musique",
    noTracks: "Aucun morceau trouvé.",
    history: "Historique",
    historyHeading: "Écoutés récemment",
    users: "Utilisateurs",
    community: "Communauté",
    upload: "Publier",
    files: "Fichiers audio",
    title: "Titre du projet",
    publish: "Publier",
    published: "Votre projet est publié.",
    view: "Voir dans le catalogue",
    play: "Lire le projet",
    logout: "Se déconnecter",
    missing: "Cet élément n’est plus disponible.",
  },
  es: {
    heading: "Crea tu cuenta",
    username: "Nombre de usuario",
    display: "Nombre visible",
    email: "Correo electrónico",
    password: "Contraseña",
    confirm: "Confirmar contraseña",
    create: "Crear cuenta",
    login: "Iniciar sesión",
    submit: "Iniciar sesión",
    invalid: "Correo o contraseña incorrectos.",
    required: "Completa este campo.",
    profile: "Perfil",
    edit: "Editar perfil",
    save: "Guardar cambios",
    library: "Biblioteca",
    empty:
      "Todavía no hay nada guardado aquí. Explora el catálogo para añadir lo que te gusta.",
    playlists: "Mis listas",
    startPlaylist: "Crear una lista",
    editPlaylist: "Editar lista",
    description: "Descripción",
    cancel: "Cancelar",
    searchPlaylists: "Buscar listas",
    sortPlaylists: "Ordenar listas",
    artwork: "Imagen de portada",
    invalidArtwork: "Elige una imagen PNG, JPEG o WebP de hasta 25 MB.",
    addTracks: "Añadir canciones",
    addSelection: "Añadir selección (1)",
    duplicateConfirmation: "Ya en la lista (1 canción):",
    name: "Nombre",
    createPlaylist: "Crear lista",
    created: "Lista creada.",
    catalog: "Catálogo",
    search: "Buscar música",
    noTracks: "No se encontraron canciones.",
    history: "Historial",
    historyHeading: "Escuchado recientemente",
    users: "Usuarios",
    community: "Comunidad",
    upload: "Publicar",
    files: "Archivos de audio",
    title: "Título del proyecto",
    publish: "Publicar",
    published: "Tu proyecto está publicado.",
    view: "Ver en el catálogo",
    play: "Reproducir proyecto",
    logout: "Cerrar sesión",
    missing: "Este elemento ya no está disponible.",
  },
};
/** Produit un petit WAV valide de vingt secondes, suffisamment long pour contrôler une lecture continue. */
function audioFixture() {
  const sampleRate = 8000,
    samples = sampleRate * 20,
    buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(
      Math.round(Math.sin((i * Math.PI * 440) / sampleRate) * 1500),
      44 + i * 2,
    );
  return buffer;
}
/** Change de langue avec le vrai sélecteur et attend la mise à jour accessible du document. */
async function language(page, value) {
  await page.locator(".language-selector select").selectOption(value);
  await expect(page.locator("html")).toHaveAttribute("lang", value);
}
/** Navigue par les boutons du compte, sans recharger l'application. */
async function tab(page, label) {
  await page
    .locator(".main-navigation")
    .getByRole("button", { name: label, exact: true })
    .click();
}
/** Attend que le vrai compte soit prêt après l'inscription asynchrone. */
async function ready(context, email) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const response = await context.request.post(base + "/api/auth/login", {
      data: { email, password },
    });
    if (response.status() === 200) return;
    assert.equal(response.status(), 202);
    await delay(200);
  }
  throw Error("Registration did not complete");
}
/** Lance Chromium uniquement pour cette campagne. */
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  // Les langues régionales, le repli anglais, la mémoire et le stockage bloqué sont testés sans compte.
  for (const [locale, expected] of [
    ["fr-CA", "fr"],
    ["es-MX", "es"],
    ["de-DE", "en"],
  ]) {
    const context = await browser.newContext({
      locale,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    await page.goto(base);
    await expect(
      page.getByRole("heading", {
        name: labels[expected].heading,
        exact: true,
      }),
    ).toBeVisible();
    await language(page, "es");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.evaluate(() =>
      localStorage.setItem("ft-goodvibes-language", "invalid"),
    );
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", expected);
    await context.close();
  }
  const blocked = await browser.newContext({
    locale: "fr-FR",
    ignoreHTTPSErrors: true,
  });
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(base);
  await language(blockedPage, "es");
  await expect(
    blockedPage.getByRole("heading", { name: labels.es.heading }),
  ).toBeVisible();
  await blocked.close();
  console.log(
    "[LANGUAGES] PASS browser variants, English fallback, persistence and blocked storage",
  );

  for (const locale of ["fr", "en", "es"]) {
    const l = labels[locale],
      context = await browser.newContext({
        locale,
        ignoreHTTPSErrors: true,
        viewport: { width: 1280, height: 900 },
      });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(20000);
    const username = "lang_" + randomUUID().replaceAll("-", "").slice(0, 12),
      email = username + "@example.invalid";
    await page.goto(base);
    await page.getByRole("button", { name: l.create, exact: true }).click();
    assert.equal(
      await page
        .getByLabel(l.username, { exact: true })
        .evaluate((field) => field.validationMessage),
      l.required,
    );
    await page.getByLabel(l.username, { exact: true }).fill(username);
    await page.getByLabel(l.display, { exact: true }).fill("History");
    await language(page, locale === "es" ? "fr" : "es");
    assert.equal(
      await page.locator('input[autocomplete="username"]').inputValue(),
      username,
    );
    await language(page, locale);
    await page.getByLabel(l.email, { exact: true }).fill(email);
    await page.getByLabel(l.password, { exact: true }).fill(password);
    await page.getByLabel(l.confirm, { exact: true }).fill(password);
    await page.getByRole("button", { name: l.create, exact: true }).click();
    await expect(page.locator(".message h2")).toBeVisible();
    await ready(context, email);
    await tab(page, l.login);
    await page.getByLabel(l.email, { exact: true }).fill(email);
    await page
      .getByLabel(l.password, { exact: true })
      .fill("Wrong-test-password-2026");
    await page
      .locator("form")
      .getByRole("button", { name: l.submit, exact: true })
      .click();
    await expect(page.getByRole("alert")).toHaveText(l.invalid);
    await language(page, "fr");
    await expect(page.getByRole("alert")).toHaveText(labels.fr.invalid);
    await language(page, locale);
    await page.getByLabel(l.password, { exact: true }).fill(password);
    await page
      .locator("form")
      .getByRole("button", { name: l.submit, exact: true })
      .click();
    await expect(page.locator("#profile-name")).toHaveText("History");
    await page.getByRole("button", { name: l.edit, exact: true }).click();
    await page
      .getByLabel(l.display, { exact: true })
      .fill("History — unchanged");
    await page.getByRole("button", { name: l.save, exact: true }).click();
    await expect(page.locator("#profile-name")).toHaveText(
      "History — unchanged",
    );
    await tab(page, l.users);
    await expect(
      page.getByRole("heading", { name: l.users, exact: true }),
    ).toBeVisible();
    await tab(page, l.library);
    await expect(page.getByText(l.empty, { exact: true })).toBeVisible();
    await page
      .locator(".music-tabs")
      .getByRole("button", { name: l.playlists, exact: true })
      .click();
    await page.getByLabel(l.searchPlaylists, { exact: true }).fill("History");
    await page
      .getByLabel(l.sortPlaylists, { exact: true })
      .selectOption("name");
    await page
      .getByRole("button", { name: l.startPlaylist, exact: true })
      .click();
    await page.getByLabel(l.name, { exact: true }).fill("History");
    // Changer de langue ne remonte pas le formulaire ni ne perd son brouillon.
    await language(page, "es");
    await expect(page.getByLabel(labels.es.name, { exact: true })).toHaveValue(
      "History",
    );
    await language(page, locale);
    await page
      .getByRole("button", { name: l.createPlaylist, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "History", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: l.editPlaylist, exact: true })
      .click();
    await page
      .getByLabel(l.description, { exact: true })
      .fill("History — unchanged draft");
    await language(page, "es");
    await expect(
      page.getByLabel(labels.es.description, { exact: true }),
    ).toHaveValue("History — unchanged draft");
    await expect(
      page.getByRole("heading", { name: "History", exact: true }),
    ).toBeVisible();
    await language(page, locale);
    // Une erreur produite par le nouveau formulaire reste traduisible après son affichage.
    await page.getByLabel(l.artwork, { exact: true }).setInputFiles({
      name: "invalid.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("invalid image"),
    });
    await page.getByRole("button", { name: l.save, exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(l.invalidArtwork);
    await language(page, "es");
    await expect(page.getByRole("alert")).toHaveText(labels.es.invalidArtwork);
    await expect(
      page.getByLabel(labels.es.description, { exact: true }),
    ).toHaveValue("History — unchanged draft");
    await language(page, locale);
    await page.getByRole("button", { name: l.cancel, exact: true }).click();
    await tab(page, l.catalog);
    await page
      .getByRole("searchbox", { name: l.search })
      .fill("no_match_" + randomUUID());
    await expect(page.getByText(l.noTracks, { exact: true })).toBeVisible();
    await tab(page, l.library);
    await page
      .locator(".music-tabs")
      .getByRole("button", { name: l.history, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: l.historyHeading }),
    ).toBeVisible();
    await tab(page, l.upload);

    // Retarde la réponse d'un vrai transfert pour changer de langue pendant son attente.
    let releaseUpload,
      uploadCount = 0;
    const gate = new Promise((resolve) => {
      releaseUpload = resolve;
    });
    await page.route("**/api/media/assets?temporary=1", async (route) => {
      uploadCount++;
      const response = await route.fetch();
      await gate;
      await route.fulfill({ response });
    });
    await page.getByLabel(l.files, { exact: true }).setInputFiles({
      name: "History.wav",
      mimeType: "audio/wav",
      buffer: audioFixture(),
    });
    await expect.poll(() => uploadCount).toBe(1);
    await language(page, "es");
    assert.equal(
      await page.locator(".upload-track-list input").inputValue(),
      "History",
    );
    await language(page, locale);
    releaseUpload();
    await expect(
      page
        .locator(".publish-form")
        .getByRole("button", { name: l.publish, exact: true }),
    ).toBeEnabled();
    await page.getByLabel(l.title, { exact: true }).fill("History " + locale);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText(l.published, { exact: true })).toBeVisible({
      timeout: 60000,
    });
    assert.equal(uploadCount, 1);
    await page.getByRole("button", { name: l.view, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "History " + locale, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: l.play, exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator("audio")
          .evaluate((audio) => !audio.paused && audio.currentTime > 0),
      )
      .toBe(true);
    const before = await page.locator("audio").evaluate((audio) => {
      audio.dataset.languageWitness = "original";
      return audio.currentTime;
    });
    await language(page, "es");
    assert.equal(
      await page.locator("audio").getAttribute("data-language-witness"),
      "original",
    );
    assert.equal(
      await page.locator("audio").evaluate((audio) => audio.paused),
      false,
    );
    assert(
      (await page.locator("audio").evaluate((audio) => audio.currentTime)) >=
        before,
    );
    await page.getByRole("button", { name: "Cola", exact: true }).click();
    await expect(page.locator(".queue-source")).toHaveText("History " + locale);
    await page.keyboard.press("Escape");
    await language(page, locale);
    await page.locator(".player-close").click();

    // Les sélections et confirmations du nouveau détail restent cohérentes dans chaque langue.
    await tab(page, l.library);
    await page
      .locator(".music-tabs")
      .getByRole("button", { name: l.playlists, exact: true })
      .click();
    await page
      .locator(".playlist-card")
      .filter({ has: page.getByText("History", { exact: true }) })
      .click();
    const trackSearch = page.getByRole("region", {
      name: l.addTracks,
      exact: true,
    });
    await trackSearch.getByRole("checkbox").first().check();
    await language(page, "es");
    const spanishSearch = page.getByRole("region", {
      name: labels.es.addTracks,
      exact: true,
    });
    await expect(spanishSearch.getByRole("checkbox").first()).toBeChecked();
    await expect(
      spanishSearch.getByRole("button", {
        name: labels.es.addSelection,
        exact: true,
      }),
    ).toBeEnabled();
    await language(page, locale);
    await trackSearch
      .getByRole("button", { name: l.addSelection, exact: true })
      .click();
    await expect(page.locator(".music-occurrences [data-item-id]")).toHaveCount(
      1,
    );
    await expect(trackSearch.getByRole("checkbox").first()).not.toBeChecked();
    await trackSearch.getByRole("checkbox").first().check();
    let duplicateMessage;
    page.once("dialog", async (dialog) => {
      duplicateMessage = dialog.message();
      await dialog.accept();
    });
    await trackSearch
      .getByRole("button", { name: l.addSelection, exact: true })
      .click();
    assert(
      duplicateMessage?.startsWith(l.duplicateConfirmation),
      duplicateMessage,
    );
    await expect(page.locator(".music-occurrences [data-item-id]")).toHaveCount(
      2,
    );

    // Contrôle le sélecteur au clavier et la largeur de l'en-tête sur mobile.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `/tmp/tr-library-language-${locale}.png`, fullPage: true });
    const layout = await page.evaluate(() => ({
      width: innerWidth, content: document.documentElement.scrollWidth,
    }));
    assert(layout.content <= layout.width + 1, `Library overflows in ${locale}: ${JSON.stringify(layout)}`);
    await page.locator(".language-selector select").focus();
    await expect(page.locator(".language-selector select")).toBeFocused();
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    const fits = await page
      .locator(".language-selector")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      });
    assert(fits, "Language selector must fit on mobile");
    await language(page, locale);
    await tab(page, l.logout);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await page.goto(base + "/#/projects/" + randomUUID());
    await expect(page.getByRole("alert")).toHaveText(l.missing);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `[LANGUAGES] PASS ${locale}: registration, validation, login errors, profile, library, playlists, search, history, upload, publication, uninterrupted audio, public errors, mobile and keyboard`,
    );
  }
} finally {
  await browser.close();
}
