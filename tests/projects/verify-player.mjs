/** Parcours du lecteur avec vrais comptes, playlists, audios et suivi ; pannes injectées explicitement. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "../files/node_modules/playwright/index.mjs";

/** Origine fixe du runner isolé ; aucune URL de développement n’est acceptée. */
const base = "https://127.0.0.1:5445";
/** Identifiant synthétique partagé par les comptes jetables de cette campagne. */
const password = "Player-test-only-password-2026";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  locale: "en-US", ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 1000 },
});
/** Appelle les services réels et exige le statut attendu sans afficher de jeton. */
async function api(path, { token, method = "GET", data, status = 200 } = {}) {
  const response = await context.request.fetch(base + path, {
    method,
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  assert.equal(response.status(), status, `${method} ${path}`);
  return status === 204 ? null : response.json();
}
/** Crée un compte exclusivement dans la pile de test et attend son profil. */
async function account() {
  const username = "player_" + randomUUID().slice(0, 8),
    email = username + "@example.invalid";
  const response = await context.request.post(base + "/api/auth/signup", {
    data: { username, email, password, displayName: username },
  });
  assert([201, 202].includes(response.status()));
  for (let index = 0; index < 30; index++) {
    const login = await context.request.post(base + "/api/auth/login", {
      data: { email, password },
    });
    if (login.status() === 202) {
      await delay(200);
      continue;
    }
    assert.equal(login.status(), 200);
    const { token } = await login.json();
    const profile = await api("/api/users/me", { token });
    return { email, token, id: profile.userId };
  }
  throw Error("Profile provisioning timed out");
}
/** Connecte le compte par l’interface ; la navigation complète simule aussi le rechargement. */
async function signIn(page, user) {
  await page.goto(base);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).waitFor();
}
/** Navigue sans recharger la session conservée en mémoire. */
async function navigate(page, route) {
  await page.evaluate((route) => {
    location.hash = route;
  }, route);
}
/** Attend une propriété observable avec un délai borné. */
async function until(check) {
  for (let i = 0; i < 80; i++) {
    if (await check()) return;
    await delay(100);
  }
  throw Error("Observation timed out");
}
/** Lit seulement la reprise du compte de test, sans accéder à sa session. */
async function saved(page, user) {
  return page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem(`ft.music-player.v1:${id}`) ?? "null"),
    user.id,
  );
}
/** Attend l’audio réellement en lecture puis le met en pause pour inspecter une file stable. */
async function pause(page) {
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
}
/** Règle le mode uniquement au moyen du bouton visible. */
async function repeat(page, mode) {
  for (let i = 0; i < 3; i++) {
    if (
      await page
        .getByRole("button", { name: `Repeat ${mode}`, exact: true })
        .count()
    )
      return;
    await page
      .getByRole("button", { name: /^Repeat (off|queue|one)$/ })
      .click();
  }
}
/** Termine le fichier par un vrai déplacement et un événement ended du navigateur. */
async function finish(page) {
  await page.locator("audio").evaluate((audio) => {
    audio.dataset.oldCycle = "true";
    audio.currentTime = audio.duration - 0.15;
    return audio.play();
  });
}
/** Vérifie la source du moteur, indépendamment des libellés des lignes. */
async function source(page, track) {
  await page.waitForFunction(
    (url) => document.querySelector("audio")?.getAttribute("src") === url,
    track.audioUrl,
  );
}
try {
  const errors = [],
    page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const projects = await api("/api/catalog/projects?page=1&pageSize=24");
  const project = projects.items.find((p) => p.tracks.length === 3);
  assert(
    project,
    "Run verify-projects.mjs first to create published audio fixtures",
  );
  const [a, b] = await Promise.all([account(), account()]);
  let playlist = await api("/api/library/playlists", {
    token: a.token,
    method: "POST",
    status: 201,
    data: { name: "Player occurrences", description: "", visibility: "public" },
  });
  for (const track of [
    project.tracks[0],
    project.tracks[1],
    project.tracks[0],
    project.tracks[2],
  ])
    playlist = await api(`/api/library/playlists/${playlist.id}/items`, {
      token: a.token,
      method: "POST",
      data: { trackId: track.id, expectedVersion: playlist.version },
    });
  await signIn(page, a);
  await navigate(page, `/playlists/${playlist.id}`);
  const rows = page.locator(".music-track-row");
  await rows.nth(2).locator(".track-label strong").click();
  await pause(page);
  await until(async () => (await saved(page, a))?.entries.length === 4);
  let state = await saved(page, a);
  assert.equal(
    state.entries.find((entry) => entry.key === state.current).occurrence,
    playlist.items[2].id,
  );
  assert.equal(
    await rows
      .filter({
        has: page.locator(
          '[aria-label="Play ' + project.tracks[0].title + '"]',
        ),
      })
      .count(),
    2,
  );
  assert.equal(
    await page.locator('.music-track-row[aria-current="true"]').count(),
    1,
  );
  // Une commande de menu n’interrompt pas le titre et cible une nouvelle occurrence.
  const previousSource = await page.locator("audio").getAttribute("src");
  await rows.first().locator("summary").click();
  await rows
    .first()
    .getByRole("button", { name: "Play next", exact: true })
    .click();
  assert.equal(await page.locator("audio").getAttribute("src"), previousSource);
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  assert.equal(await page.locator("[data-queue-entry]").count(), 2);
  await page
    .getByRole("button", {
      name: "Remove queued " + project.tracks[0].title,
      exact: true,
    })
    .click();
  assert.equal(await page.locator("[data-queue-entry]").count(), 1);
  assert.equal(
    (await api(`/api/library/playlists/${playlist.id}`, { token: a.token }))
      .items.length,
    4,
  );
  await page.keyboard.press("Escape");
  await until(
    async () =>
      await page
        .getByRole("button", { name: "Queue", exact: true })
        .evaluate((e) => e === document.activeElement),
  );
  await rows.nth(1).focus();
  await page.keyboard.press("Enter");
  await pause(page);
  await source(page, project.tracks[1]);
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await pause(page);
  await source(page, project.tracks[0]);
  await page
    .getByRole("button", { name: "Previous track", exact: true })
    .click();
  await pause(page);
  await source(page, project.tracks[1]);
  await page.locator("audio").evaluate((audio) => {
    audio.currentTime = 4;
  });
  await page
    .getByRole("button", { name: "Previous track", exact: true })
    .click();
  assert(
    (await page.locator("audio").evaluate((audio) => audio.currentTime)) < 0.5,
  );
  await source(page, project.tracks[1]);
  console.log(
    "[PLAYER] PASS complete playlist, duplicate identity, row keyboard, menu isolation, previous and queue removal",
  );

  await repeat(page, "one");
  const historyBefore = (
    await api("/api/playback/sessions", { token: a.token })
  ).total;
  await finish(page);
  await page.waitForFunction(
    () => !document.querySelector("audio")?.dataset.oldCycle,
  );
  await pause(page);
  await source(page, project.tracks[1]);
  await until(
    async () =>
      (await api("/api/playback/sessions", { token: a.token })).total >
      historyBefore,
  );
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await pause(page);
  await source(page, project.tracks[0]);
  await repeat(page, "queue");
  await rows.last().locator(".track-label strong").click();
  await pause(page);
  await finish(page);
  await source(page, project.tracks[0]);
  await pause(page);
  await repeat(page, "off");
  await rows.last().locator(".track-label strong").click();
  await pause(page);
  await finish(page);
  await page.waitForFunction(() => document.querySelector("audio")?.ended);
  await source(page, project.tracks[2]);
  await page.getByRole("button", { name: "Shuffle play", exact: true }).click();
  await pause(page);
  state = await saved(page, a);
  assert.equal(state.shuffle, true);
  assert.equal(new Set(state.order).size, 4);
  const played = [];
  for (let i = 0; i < 4; i++) {
    played.push((await saved(page, a)).current);
    if (i < 3) {
      await page
        .getByRole("button", { name: "Next track", exact: true })
        .click();
      await pause(page);
    }
  }
  assert.equal(new Set(played).size, 4);
  await page.getByRole("button", { name: "Shuffle", exact: true }).click();
  state = await saved(page, a);
  assert.deepEqual(
    state.order,
    state.entries.map((entry) => entry.key),
  );
  console.log(
    "[PLAYER] PASS natural repeat one/all/off, manual next override, shuffle cycle and real listening sessions",
  );

  await navigate(page, `/projects/${project.id}`);
  await page.getByRole("button", { name: "Play project", exact: true }).click();
  await pause(page);
  await page.locator("audio").evaluate((audio) => {
    audio.currentTime = 2;
  });
  await page.getByRole("slider", { name: "Volume", exact: true }).fill("0.34");
  await page.getByRole("button", { name: "Shuffle", exact: true }).click();
  await repeat(page, "one");
  await until(async () => (await saved(page, a))?.position >= 1.9);
  await signIn(page, a);
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await page.waitForFunction(
    () => document.querySelector("audio")?.currentTime >= 1.9,
  );
  assert(await page.locator("audio").evaluate((audio) => audio.paused));
  assert.equal(
    await page
      .getByRole("slider", { name: "Volume", exact: true })
      .inputValue(),
    "0.34",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Shuffle", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Repeat one", exact: true }).waitFor();
  await signIn(page, b);
  assert.equal(await page.locator("audio").count(), 0);
  await signIn(page, a);
  await page.locator("audio").waitFor({ state: "attached" });
  console.log(
    "[PLAYER] PASS paused restoration, position, volume, repeat/shuffle and account isolation",
  );

  // Le titre courant reste inchangé lorsqu’on agit sur un like ou un lien artiste.
  await navigate(page, `/projects/${project.id}`);
  await page.getByRole("button", { name: "Play project", exact: true }).click();
  await pause(page);
  const stable = await page.locator("audio").getAttribute("src");
  await rows
    .nth(1)
    .getByRole("button", { name: "Like track", exact: true })
    .click();
  assert.equal(await page.locator("audio").getAttribute("src"), stable);
  await rows
    .nth(1)
    .getByRole("button", { name: project.tracks[1].artistName, exact: true })
    .click();
  await page.getByRole("dialog", { name: "Artist profile" }).waitFor();
  assert.equal(await page.locator("audio").getAttribute("src"), stable);
  await page
    .getByRole("button", { name: "Close profile", exact: true })
    .click();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByRole("searchbox").fill(project.tracks[1].title);
  await page
    .locator(".music-track-row")
    .first()
    .locator(".track-label strong")
    .click();
  await pause(page);
  assert.equal((await saved(page, a)).entries.length, 1);
  await page.getByRole("searchbox").focus();
  await page.keyboard.press("Space");
  assert(await page.locator("audio").evaluate((audio) => audio.paused));
  await page.locator("body").click({ position: { x: 2, y: 300 } });
  await page.keyboard.press("Space");
  await pause(page);
  console.log(
    "[PLAYER] PASS independent likes/artist links, search-only queue and keyboard input exclusion",
  );

  // La pagination est simulée uniquement pour les références : les octets audio restent réels.
  const references = Array.from({ length: 127 }, (_, index) => ({
    ...project.tracks[index % 3],
    id: randomUUID(),
    title: `Liked fixture ${String(index).padStart(2, "0")}`,
  }));
  await page.route("**/api/library/collections/track?*", (route) => {
    const page = Number(
      new URL(route.request().url()).searchParams.get("page"),
    );
    return route.fulfill({
      json: {
        items: references.slice((page - 1) * 100, page * 100).map((track) => ({
          id: track.id,
          createdAt: new Date().toISOString(),
        })),
        total: references.length,
        page,
        pageSize: 100,
      },
    });
  });
  await page.route("**/api/catalog/tracks/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    const track = references.find((item) => item.id === id);
    return track ? route.fulfill({ json: track }) : route.continue();
  });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await returnToTab(page);
  await page.getByText("Liked fixture 00", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Liked fixture 25", { exact: true }).click();
  await pause(page);
  state = await saved(page, a);
  assert.equal(state.entries.length, 127);
  assert.equal(
    state.entries.find((entry) => entry.key === state.current).trackId,
    references[25].id,
  );
  await page
    .getByRole("button", { name: "Close audio player", exact: true })
    .click();
  await page.unroute("**/api/library/collections/track?*");
  await page.unroute("**/api/catalog/tracks/*");
  console.log(
    "[PLAYER] PASS liked tracks beyond server and visible pagination (reference responses simulated)",
  );

  await navigate(page, `/projects/${project.id}`);
  await page.getByRole("button", { name: "Play project", exact: true }).click();
  await pause(page);
  await repeat(page, "queue");
  let failedRequests = 0;
  await page.route("**/api/media/assets/*/audio", (route) => {
    failedRequests++;
    return route.fulfill({ status: 404, body: "Unavailable" });
  });
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await page
    .getByText(
      "No playable tracks remain. Retry playback or choose another track.",
      { exact: true },
    )
    .waitFor();
  assert(failedRequests <= 3);
  const count = failedRequests;
  await delay(500);
  assert.equal(failedRequests, count);
  await page.unroute("**/api/media/assets/*/audio");
  await page
    .getByRole("button", { name: "Retry playback", exact: true })
    .click();
  await pause(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await page
    .getByText("Network unavailable. Retry playback when connected.", {
      exact: true,
    })
    .waitFor();
  await context.setOffline(false);
  await page
    .getByRole("button", { name: "Retry playback", exact: true })
    .click();
  await pause(page);
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  await mkdir("/tmp/tr-player-evidence", { recursive: true });
  await page.screenshot({
    path: "/tmp/tr-player-evidence/desktop.png",
    fullPage: true,
  });
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page
        .locator(".music-player-bar")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    );
  }
  // Une restauration différée ne doit pas écraser une nouvelle sélection explicite.
  await page.getByRole("button", { name: "Close queue", exact: true }).click();
  let release,
    pending = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/catalog/tracks/*", async (route) => {
    pending = true;
    await gate;
    await route.continue();
  });
  await signIn(page, a);
  await until(async () => pending);
  await navigate(page, `/projects/${project.id}`);
  await rows.last().locator(".track-label strong").click();
  await pause(page);
  release();
  await delay(400);
  await source(page, project.tracks[2]);
  await page.unroute("**/api/catalog/tracks/*");
  // Une panne de restauration conserve la copie locale ; un vrai 404 retire la référence.
  await page.route("**/api/catalog/tracks/*", (route) =>
    route.fulfill({ status: 503, json: { error: "offline" } }),
  );
  await signIn(page, a);
  await page
    .getByRole("button", { name: "Retry restoration", exact: true })
    .waitFor();
  assert.equal((await saved(page, a)).entries.length, 3);
  await page.unroute("**/api/catalog/tracks/*");
  await page
    .getByRole("button", { name: "Retry restoration", exact: true })
    .click();
  await page.getByRole("button", { name: "Play", exact: true }).waitFor();
  await page.route("**/api/catalog/tracks/*", (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
  await signIn(page, a);
  await page
    .getByText("Unavailable tracks were removed from your restored queue.", {
      exact: true,
    })
    .waitFor();
  assert.equal(await page.locator("audio").count(), 0);
  await page.unroute("**/api/catalog/tracks/*");
  await page.evaluate(
    (id) => localStorage.setItem(`ft.music-player.v1:${id}`, "{broken"),
    a.id,
  );
  await signIn(page, a);
  assert.equal(await page.locator("audio").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "[PLAYER] PASS unavailable queue bounded under repeat, recovery, desktop layout and no browser exception",
  );
} finally {
  await context.close();
  await browser.close();
}

/** Simule le retour sur l’onglet après la fenêtre de fusion focus/visibility. */
async function returnToTab(page) {
  await page.waitForTimeout(550);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
