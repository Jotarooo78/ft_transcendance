/** Parcours d’actualisation : vrais comptes et mutations, réponses retardées et visibilité simulées explicitement. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "../files/node_modules/playwright/index.mjs";
/** Pile jetable uniquement ; les métadonnées nombreuses sont des fixtures navigateur. */
const base = "https://127.0.0.1:5445",
  password = "Refresh-test-only-2026";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
/** Attend un fait observé sans dépendre du temps d’un rendu particulier. */
async function until(check) {
  for (let n = 0; n < 100; n++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 60));
  }
  throw Error("Observation timed out");
}
/** Déclenche les événements rapprochés d’un retour d’onglet, fusionnés par l’application. */
async function focus(page) {
  await page.waitForTimeout(550);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
try {
  const context = await browser.newContext({
    locale: "en-US", ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });
  const email = "refresh_" + randomUUID().slice(0, 8) + "@example.invalid";
  await context.request.post(base + "/api/auth/signup", {
    data: {
      email,
      password,
      username: email.split("@")[0],
      displayName: "Refresh tester",
    },
  });
  let token;
  await until(async () => {
    const r = await context.request.post(base + "/api/auth/login", {
      data: { email, password },
    });
    if (r.status() !== 200) return false;
    token = (await r.json()).token;
    return true;
  });
  /** Effectue une opération réelle avec le compte jetable et contrôle son statut. */
  async function api(path, method = "GET", data, status = 200) {
    const r = await context.request.fetch(base + path, {
      method,
      data,
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(r.status(), status, `${method} ${path}`);
    return status === 204 ? null : r.json();
  }
  let playlist = await api(
    "/api/library/playlists",
    "POST",
    { name: "Stable playlist", description: "Original", visibility: "public" },
    201,
  );
  const real = (
    await api("/api/catalog/tracks?page=1&pageSize=24&q=&genre=&sort=recent")
  ).items[0];
  const tracks = Array.from({ length: 48 }, (_, i) => ({
    ...real,
    id: randomUUID(),
    title: `Refresh track ${i}`,
    coverUrl: null,
  }));
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requests = 0,
    delay = 0,
    fail = false;
  await page.route("**/api/catalog/tracks?*", async (route) => {
    requests++;
    const url = new URL(route.request().url()),
      q = url.searchParams.get("q"),
      pageNumber = Number(url.searchParams.get("page"));
    if (delay) await new Promise((r) => setTimeout(r, delay));
    await route.fulfill(
      fail
        ? { status: 503, json: {} }
        : {
            json: {
              items: q
                ? tracks.filter((t) => t.title.includes(q)).slice(0, 24)
                : tracks.slice((pageNumber - 1) * 24, pageNumber * 24),
              page: pageNumber,
              pageSize: 24,
              total: q ? tracks.filter((t) => t.title.includes(q)).length : 48,
              genres: [],
            },
          },
    );
  });
  await page.route("**/api/catalog/tracks/*", (route) => {
    const track = tracks.find((t) => route.request().url().endsWith(t.id));
    return track ? route.fulfill({ json: track }) : route.continue();
  });
  await page.clock.install();
  await page.goto(base);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page
    .getByRole("button", { name: "See all tracks", exact: true })
    .click();
  await until(
    async () => (await page.locator(".music-track-row").count()) === 24,
  );
  await page.evaluate(() => scrollTo(0, 700));
  const y = await page.evaluate(() => scrollY);
  delay = 800;
  const before = requests;
  await focus(page);
  await until(() => requests > before);
  assert.equal(await page.locator(".music-track-row").count(), 24);
  assert.equal(await page.evaluate(() => scrollY), y);
  await page.waitForTimeout(1000);
  assert.equal(requests, before + 1);
  assert.equal(await page.evaluate(() => scrollY), y);
  fail = true;
  delay = 0;
  await focus(page);
  await page.getByText(/The update failed/).waitFor();
  assert.equal(await page.locator(".music-track-row").count(), 24);
  fail = false;
  await page.getByRole("button", { name: "Retry update", exact: true }).click();
  await until(
    async () => (await page.getByText(/The update failed/).count()) === 0,
  );
  // Une nouvelle recherche ne montre pas les résultats de la précédente pendant son attente.
  delay = 700;
  await page.getByRole("searchbox").fill("Refresh track 47");
  assert.equal(await page.locator(".music-track-row").count(), 0);
  await page.getByRole("searchbox").fill("Refresh track 46");
  await page.getByText("Refresh track 46", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Refresh track 47", { exact: true }).count(),
    0,
  );
  delay = 0;
  // Horloge et propriété de visibilité simulées : aucun minuteur de liste dans un onglet masqué.
  const started = requests;
  await page.clock.fastForward(31000);
  await until(() => requests > started);
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hidden = requests;
  await page.clock.fastForward(61000);
  assert.equal(requests, hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await until(() => requests > hidden);
  assert.equal(requests, hidden + 1);
  console.log(
    "[REFRESH] PASS slow reads, failure retention/retry, query isolation, 30-second polling, hidden tab and event coalescing",
  );
  // Un ajout en tête conserve l’occurrence visible, et non seulement la coordonnée de défilement.
  let sessions = tracks.slice(0, 20).map((track, i) => ({
    id: randomUUID(),
    trackId: track.id,
    trackDurationMs: 30000,
    startedAt: new Date(1760000000000 - i * 1000).toISOString(),
    endedAt: null,
    listenedMs: 0,
    lastSequence: 0,
    positionMs: 0,
  }));
  await page.route("**/api/playback/sessions?*", (route) =>
    route.fulfill({
      json: { items: sessions, total: sessions.length, page: 1, pageSize: 20 },
    }),
  );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await until(
    async () => (await page.locator("[data-session-id]").count()) === 20,
  );
  await page.evaluate(() => scrollTo(0, 800));
  const anchor = await page.locator("[data-session-id]").evaluateAll((rows) => {
    const e = rows.find((e) => e.getBoundingClientRect().bottom > 0);
    return { id: e.dataset.sessionId, top: e.getBoundingClientRect().top };
  });
  sessions = [{ ...sessions[0], id: randomUUID() }, ...sessions.slice(0, 19)];
  await focus(page);
  await page.locator(`[data-session-id="${sessions[0].id}"]`).waitFor();
  assert(
    Math.abs(
      (await page.locator(`[data-session-id="${anchor.id}"]`).boundingBox()).y -
        anchor.top,
    ) < 1,
  );
  console.log("[REFRESH] PASS stable history anchor after insertion");
  await page.getByRole("button", { name: "My playlists", exact: true }).click();
  await page.getByRole("button", { name: /Stable playlist.*tracks/ }).click();
  await page
    .getByRole("button", { name: "Edit playlist", exact: true })
    .click();
  const editor = page.getByRole("form", { name: "Edit playlist" });
  await editor.getByLabel("Name", { exact: true }).fill("My unsaved name");
  playlist = await api(`/api/library/playlists/${playlist.id}`, "PATCH", {
    name: "Changed elsewhere",
    description: "Remote",
    visibility: "public",
    expectedVersion: playlist.version,
  });
  await focus(page);
  await page
    .getByRole("heading", { name: "Changed elsewhere", exact: true })
    .waitFor();
  assert.equal(
    await editor.getByLabel("Name", { exact: true }).inputValue(),
    "My unsaved name",
  );
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await editor.getByText(/Your inputs are preserved/).waitFor();
  assert.equal(
    (await api(`/api/library/playlists/${playlist.id}`)).name,
    "Changed elsewhere",
  );
  await editor
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "My unsaved name", exact: true })
    .waitFor();
  // Un GET lu avant une création arrive après elle : il ne doit pas enlever la nouvelle playlist.
  await page
    .getByRole("button", { name: "Back to library", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Create a playlist", exact: true })
    .click();
  let release, arrived;
  const gate = new Promise((r) => (release = r)),
    captured = new Promise((r) => (arrived = r));
  let held = false;
  await page.route("**/api/library/playlists?*", async (route) => {
    if (held) return route.continue();
    held = true;
    const response = await route.fetch();
    arrived();
    await gate;
    try {
      await route.fulfill({ response });
    } catch {
      /* La requête annulée n’a plus de destinataire. */
    }
  });
  await focus(page);
  await captured;
  const create = page.getByRole("form", {
    name: "Create playlist",
    exact: true,
  });
  await create.getByLabel("Name", { exact: true }).fill("Created during read");
  await create
    .getByRole("button", { name: "Create playlist", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Created during read",
      exact: true,
    })
    .waitFor();
  release();
  await page.waitForTimeout(500);
  await page.unrouteAll({ behavior: "wait" });
  assert.equal(
    await page
      .getByRole("heading", {
        name: "Created during read",
        exact: true,
      })
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Unfinished project");
  await focus(page);
  await page.waitForTimeout(300);
  assert.equal(
    await page.getByLabel("Project title", { exact: true }).inputValue(),
    "Unfinished project",
  );
  console.log(
    "[REFRESH] PASS dirty playlist/upload forms, explicit conflict and stale GET after mutation",
  );
  // L’accès public est réel ; une panne conserve l’affichage, un 404 confirmé le retire.
  await page.evaluate(
    (id) => (location.hash = "/playlists/" + id),
    playlist.id,
  );
  await page
    .getByRole("heading", { name: "My unsaved name", exact: true })
    .waitFor();
  const publicRoute = `**/api/library/public/playlists/${playlist.id}`;
  await page.route(publicRoute, (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await focus(page);
  await page.getByText(/The update failed/).waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "My unsaved name", exact: true })
      .count(),
    1,
  );
  await page.unroute(publicRoute);
  playlist = await api(`/api/library/playlists/${playlist.id}`);
  await api(`/api/library/playlists/${playlist.id}`, "PATCH", {
    name: playlist.name,
    description: playlist.description,
    visibility: "private",
    expectedVersion: playlist.version,
  });
  await focus(page);
  await page
    .getByRole("alert")
    .filter({ hasText: "no longer available" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "My unsaved name", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: /^Refresh / }).count(),
    0,
  );
  // Modifier les références d’une section ne doit pas vider ses lignes pendant la lecture des détails.
  let liked = tracks.slice(0, 24),
    holdNew = false,
    newRequested = false;
  await page.route("**/api/library/collections/track?*", (route) =>
    route.fulfill({
      json: {
        items: liked.map((track) => ({
          id: track.id,
          createdAt: "2026-10-15T10:00:00Z",
        })),
        total: liked.length,
        page: 1,
        pageSize: 100,
      },
    }),
  );
  await page.route("**/api/catalog/tracks/*", async (route) => {
    const track = tracks.find((item) =>
      route.request().url().endsWith(item.id),
    );
    if (!track) return route.continue();
    if (holdNew && track.id === tracks[24].id) {
      newRequested = true;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    return route.fulfill({ json: track });
  });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Liked tracks", exact: true }).click();
  await focus(page);
  await until(
    async () => (await page.locator(".music-track-row").count()) === 24,
  );
  await page.evaluate(() => scrollTo(0, 700));
  const likedAnchor = await page
    .locator(".music-track-row")
    .evaluateAll((rows) => {
      const row = rows.find((e) => e.getBoundingClientRect().bottom > 0);
      return {
        id: row.dataset.scrollAnchor,
        top: row.getBoundingClientRect().top,
      };
    });
  holdNew = true;
  liked = [tracks[24], ...liked];
  await focus(page);
  await until(() => newRequested);
  assert.equal(await page.locator(".music-track-row").count(), 24);
  await page.getByText("Refresh track 24", { exact: true }).waitFor();
  assert(
    Math.abs(
      (
        await page
          .locator(`[data-scroll-anchor="${likedAnchor.id}"]`)
          .boundingBox()
      ).y - likedAnchor.top,
    ) < 1,
  );
  await page.unroute("**/api/library/collections/track?*");
  console.log(
    "[REFRESH] PASS stable liked rows and anchor while collection membership changes",
  );
  // Une révocation doit disparaître même si la lecture d’une autre carte échoue.
  const savedA = await api(
    "/api/library/playlists",
    "POST",
    { name: "Saved public A", description: "", visibility: "public" },
    201,
  );
  const savedB = await api(
    "/api/library/playlists",
    "POST",
    { name: "Saved public B", description: "", visibility: "public" },
    201,
  );
  for (const item of [savedA, savedB])
    await api(
      "/api/library/collections/playlist/" + item.id,
      "PUT",
      undefined,
      204,
    );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page
    .getByRole("button", { name: "Saved playlists", exact: true })
    .click();
  await focus(page);
  await page.getByText("Saved public A", { exact: true }).waitFor();
  await page.getByText("Saved public B", { exact: true }).waitFor();
  await api("/api/library/playlists/" + savedA.id, "PATCH", {
    name: savedA.name,
    description: "",
    visibility: "private",
    expectedVersion: savedA.version,
  });
  await page.route("**/api/library/public/playlists/" + savedB.id, (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await focus(page);
  await page.getByText("Temporarily unavailable", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Saved public A", { exact: true }).count(),
    0,
  );
  await page.getByText("Playlist unavailable", { exact: true }).waitFor();
  console.log(
    "[REFRESH] PASS mixed saved-playlist revocation and transient failure",
  );
  assert.deepEqual(errors, []);
  console.log(
    "[REFRESH] PASS public revocation and no visible Refresh controls",
  );
} finally {
  await browser.close();
}
