/** Preuves réelles des playlists sur la pile jetable 5445 : HTTP, concurrence, images et navigateur. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "../files/node_modules/playwright/index.mjs";
const base = "https://127.0.0.1:5445";
const password = "Library-test-only-2026";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  locale: "en-US",
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
});
/** Vérifie le statut avant de décoder la réponse, sans exposer les identifiants de connexion. */
async function api(path, token, method = "GET", data, status = 200) {
  const response = await context.request.fetch(base + path, {
    method,
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  assert.equal(
    response.status(),
    status,
    `${method} ${path}: ${await response.text()}`,
  );
  return status === 204 ? null : response.json();
}
/** Attend un compte entièrement provisionné par Auth et Users. */
async function account() {
  const username = "library_" + randomUUID().slice(0, 8),
    email = username + "@example.invalid";
  const signup = await context.request.post(base + "/api/auth/signup", {
    data: { username, email, password, displayName: username },
  });
  assert([201, 202].includes(signup.status()));
  for (let i = 0; i < 30; i++) {
    const response = await context.request.post(base + "/api/auth/login", {
      data: { email, password },
    });
    if (response.status() === 202) {
      await delay(300);
      continue;
    }
    assert.equal(response.status(), 200);
    return { email, ...(await response.json()) };
  }
  throw Error("Profile provisioning timed out");
}
/** Enveloppe unique réutilisable pour prouver le traitement d'une réponse perdue. */
const command = (playlist, fields) => ({
  ...fields,
  operationId: randomUUID(),
  expectedVersion: playlist.version,
});
/** Attend une condition observable, avec délai borné. */
async function until(check) {
  for (let i = 0; i < 80; i++) {
    if (await check()) return;
    await delay(100);
  }
  throw Error("Condition timed out");
}
try {
  const [a, b] = await Promise.all([account(), account()]);
  const tracks = (await api("/api/catalog/tracks?pageSize=20&sort=recent"))
    .items;
  assert(
    tracks.length >= 2,
    "Run verify-projects first to publish real tracks",
  );
  const first = tracks[0],
    second = tracks.find((t) => t.id !== first.id);
  let p = await api(
    "/api/library/playlists",
    a.token,
    "POST",
    { name: "Workflow playlist" },
    201,
  );
  const creation = { name: "Creation retry", creationId: randomUUID() };
  const created = await Promise.all(
    [1, 2].map(() =>
      api("/api/library/playlists", a.token, "POST", creation, 201),
    ),
  );
  assert.equal(created[0].id, created[1].id);
  await api("/api/library/playlists", b.token, "POST", creation, 409);
  await api(
    "/api/library/playlists",
    a.token,
    "POST",
    { ...creation, name: "Different intent" },
    409,
  );
  assert.equal(p.visibility, "private");
  assert(p.createdAt && p.updatedAt && p.ownerUserId);
  const path = `/api/library/playlists/${p.id}`,
    actions = path + "/actions";
  const add = command(p, {
    kind: "add",
    trackIds: [first.id, second.id],
    allowDuplicates: false,
  });
  p = await api(actions, a.token, "POST", add);
  assert.equal(p.items.length, 2);
  assert.deepEqual(
    await api(actions, a.token, "POST", add),
    p,
    "lost-response retry is exactly once",
  );
  await api(
    actions,
    b.token,
    "POST",
    command(p, { kind: "remove", itemId: p.items[0].id }),
    404,
  );
  await api(
    actions,
    a.token,
    "POST",
    command(p, {
      kind: "add",
      trackIds: [first.id, first.id],
      allowDuplicates: false,
    }),
    409,
  );
  assert.equal(
    (await api(path, a.token)).version,
    p.version,
    "duplicate refusal is atomic",
  );
  p = await api(
    actions,
    a.token,
    "POST",
    command(p, {
      kind: "add",
      trackIds: [first.id, first.id],
      allowDuplicates: true,
    }),
  );
  assert.equal(new Set(p.items.map((i) => i.id)).size, 4);
  const original = p.items;
  p = await api(
    actions,
    a.token,
    "POST",
    command(p, {
      kind: "reorder",
      itemIds: original.map((i) => i.id).reverse(),
    }),
  );
  assert.deepEqual(
    p.items.map((i) => [i.id, i.addedAt]),
    original.map((i) => [i.id, i.addedAt]).reverse(),
  );
  await api(
    actions,
    a.token,
    "POST",
    command(p, { kind: "reorder", itemIds: p.items.slice(1).map((i) => i.id) }),
    400,
  );
  const removed = p.items[1],
    removal = command(p, { kind: "remove", itemId: removed.id });
  p = await api(actions, a.token, "POST", removal);
  const appended = command(p, {
    kind: "add",
    trackIds: [second.id],
    allowDuplicates: true,
  });
  p = await api(actions, a.token, "POST", appended);
  p = await api(
    actions,
    a.token,
    "POST",
    command(p, { kind: "restore", removalId: removal.operationId }),
  );
  assert.equal(p.items[1].id, removed.id);
  assert.equal(p.items[1].addedAt, removed.addedAt);
  assert.equal(p.items.length, 5);
  await api(
    actions,
    a.token,
    "POST",
    command(p, { kind: "restore", removalId: removal.operationId }),
    409,
  );
  await api(
    actions,
    a.token,
    "POST",
    command(p, {
      kind: "add",
      trackIds: Array(501).fill(first.id),
      allowDuplicates: true,
    }),
    400,
  );
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      context.request.post(base + actions, {
        headers: { Authorization: `Bearer ${a.token}` },
        data: command(p, {
          kind: "add",
          trackIds: [second.id],
          allowDuplicates: true,
        }),
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status()).sort(), [200, 409]);
  p = await api(path, a.token);
  console.log(
    "[LIBRARY] PASS atomic batches, duplicate confirmation, stable occurrence order, undo, concurrency, retry and ownership",
  );

  // Un vrai PNG validé par Media ; aucune fixture ne remplace la réponse d'une API.
  const png = execFileSync("docker", [
    "exec",
    "transcendence_projects-media-service-1",
    "node",
    "--input-type=module",
    "-e",
    "import sharp from 'sharp'; process.stdout.write(await sharp({create:{width:64,height:64,channels:3,background:'#8e5175'}}).png().toBuffer())",
  ]);
  const imageResponse = await context.request.post(
    base + "/api/media/playlist-images",
    {
      headers: { Authorization: `Bearer ${a.token}` },
      multipart: {
        file: { name: "cover.png", mimeType: "image/png", buffer: png },
      },
    },
  );
  assert.equal(imageResponse.status(), 200, await imageResponse.text());
  const image = await imageResponse.json();
  const foreign = await api(
    "/api/library/playlists",
    b.token,
    "POST",
    { name: "Other account" },
    201,
  );
  await api(
    `/api/library/playlists/${foreign.id}/artwork`,
    b.token,
    "PUT",
    { assetId: image.id, expectedVersion: foreign.version },
    409,
  );
  p = await api(path + "/artwork", a.token, "PUT", {
    assetId: image.id,
    expectedVersion: p.version,
  });
  assert.equal(p.coverAssetId, image.id);
  assert.equal(
    (
      await context.request.get(base + `/api/media/playlists/${p.id}/artwork`)
    ).status(),
    404,
  );
  await api(`/api/media/assets/${image.id}`, a.token, "DELETE", undefined, 409);
  p = await api(path, a.token, "PATCH", {
    visibility: "public",
    expectedVersion: p.version,
  });
  const publicImage = await context.request.get(
    base + `/api/media/playlists/${p.id}/artwork`,
  );
  assert.equal(publicImage.status(), 200);
  assert.equal(publicImage.headers()["cache-control"], "no-store");
  assert.deepEqual(await publicImage.body(), png);
  const copyIntent = { targetId: randomUUID(), expectedVersion: p.version };
  let copy = await api(path + "/duplicate", b.token, "POST", copyIntent);
  assert.deepEqual(
    await api(path + "/duplicate", b.token, "POST", copyIntent),
    copy,
  );
  assert.equal(copy.visibility, "private");
  assert.equal(copy.ownerUserId, foreign.ownerUserId);
  assert.deepEqual(
    copy.items.map((i) => i.trackId),
    p.items.map((i) => i.trackId),
  );
  assert(
    copy.items.every((i) => !p.items.some((source) => source.id === i.id)),
  );
  copy = await api(
    `/api/library/playlists/${copy.id}/actions`,
    b.token,
    "POST",
    command(copy, { kind: "remove", itemId: copy.items[0].id }),
  );
  assert.equal((await api(path, a.token)).items.length, copy.items.length + 1);
  await api(
    `/api/library/collections/playlist/${p.id}`,
    b.token,
    "PUT",
    undefined,
    204,
  );
  p = await api(path, a.token, "PATCH", {
    visibility: "private",
    expectedVersion: p.version,
  });
  assert.equal(
    (
      await context.request.get(base + `/api/media/playlists/${p.id}/artwork`)
    ).status(),
    404,
  );
  await api(
    path + "/duplicate",
    b.token,
    "POST",
    { targetId: randomUUID(), expectedVersion: p.version },
    404,
  );
  const invalid = await context.request.post(
    base + "/api/media/playlist-images",
    {
      headers: { Authorization: `Bearer ${a.token}` },
      multipart: {
        file: {
          name: "bad.png",
          mimeType: "image/png",
          buffer: Buffer.from("not an image"),
        },
      },
    },
  );
  assert(invalid.status() >= 400 && invalid.status() < 500);
  console.log(
    "[LIBRARY] PASS private covers, public revocation, foreign image refusal, bound-image protection and independent private copies",
  );

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: "Library", exact: true }).click();
  assert.equal(
    await page
      .getByRole("navigation", { name: "User navigation" })
      .getByRole("button", { name: /^(Playlists|History)$/ })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "My playlists", exact: true }).click();
  await page.getByLabel("Search playlists", { exact: true }).fill("Workflow");
  await page.getByLabel("Sort playlists", { exact: true }).selectOption("name");
  await page.getByRole("button", { name: /Workflow playlist.*tracks/ }).click();
  await page
    .getByRole("heading", { name: "Workflow playlist", exact: true })
    .waitFor();
  await page.locator(".playlist-hero .playlist-artwork img").waitFor();
  await until(
    async () =>
      await page
        .locator(".playlist-hero .playlist-artwork img")
        .evaluate((img) => img.complete && img.naturalWidth === 64),
  );
  await page
    .getByRole("button", { name: "Back to library", exact: false })
    .click();
  assert.equal(
    await page.getByLabel("Search playlists", { exact: true }).inputValue(),
    "Workflow",
  );
  assert.equal(
    await page.getByLabel("Sort playlists", { exact: true }).inputValue(),
    "name",
  );
  await page.getByRole("button", { name: /Workflow playlist.*tracks/ }).click();
  const before = await api(path, a.token);
  await page
    .locator(".music-occurrences [data-item-id]")
    .first()
    .getByRole("button", { name: "Remove track", exact: true })
    .click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await until(
    async () => (await api(path, a.token)).items.length === before.items.length,
  );
  assert.deepEqual(
    (await api(path, a.token)).items.map((i) => i.id),
    before.items.map((i) => i.id),
  );
  const handle = page.getByRole("button", { name: /^Reorder / }).first();
  await handle.focus();
  await handle.press("Alt+ArrowDown");
  await until(
    async () => (await api(path, a.token)).items[1].id === before.items[0].id,
  );
  await page.getByLabel("Track order", { exact: true }).selectOption("title");
  assert.equal(
    await page
      .getByRole("button", { name: /^Reorder / })
      .first()
      .isEnabled(),
    false,
  );
  await page
    .getByLabel("Search in playlist", { exact: true })
    .fill(second.title);
  await page
    .getByRole("button", { name: "Play playlist", exact: true })
    .click();
  // Une recherche n'efface pas les autres titres de la file.
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  assert.equal(
    await page.locator("[data-queue-entry]").count(),
    before.items.length - 1,
  );
  await page.getByRole("button", { name: "Close queue", exact: true }).click();
  await page.getByLabel("Search in playlist", { exact: true }).fill("");
  await page.getByLabel("Track order", { exact: true }).selectOption("manual");
  const dragBefore = await api(path, a.token);
  await page
    .getByRole("button", { name: /^Reorder / })
    .first()
    .dragTo(page.locator(".music-occurrences [data-item-id]").nth(2));
  await until(
    async () =>
      (await api(path, a.token)).items[2].id === dragBefore.items[0].id,
  );
  const search = page.getByRole("region", { name: "Add tracks" });
  await search.getByRole("checkbox").first().check();
  page.once("dialog", (dialog) => dialog.accept());
  await search
    .getByRole("button", { name: "Add selection (1)", exact: true })
    .click();
  await until(
    async () =>
      (await api(path, a.token)).items.length === before.items.length + 1,
  );
  await search
    .getByRole("button", { name: "Add selection (0)", exact: true })
    .waitFor();
  // Le serveur écrit, mais le navigateur perd la réponse : la reprise doit retrouver le reçu.
  let loseReply = true;
  const attempts = [];
  await page.route("**" + actions, async (route) => {
    if (route.request().postDataJSON()?.kind !== "add") return route.continue();
    attempts.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (loseReply) {
      loseReply = false;
      return route.abort();
    }
    return route.fulfill({ response });
  });
  await search.getByRole("checkbox").first().check();
  page.once("dialog", (dialog) => dialog.accept());
  await search
    .getByRole("button", { name: "Add selection (1)", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: /fetch|confirm|network/i })
    .waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await search
    .getByRole("button", { name: "Add selection (1)", exact: true })
    .click();
  await search
    .getByRole("button", { name: "Add selection (0)", exact: true })
    .waitFor();
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(
    (await api(path, a.token)).items.length,
    before.items.length + 2,
  );
  await page.unroute("**" + actions);
  await page
    .getByRole("button", { name: "Edit playlist", exact: true })
    .click();
  await page
    .getByRole("form", { name: "Edit playlist" })
    .getByLabel("Description", { exact: true })
    .fill("Draft kept during refresh");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await delay(300);
  assert.equal(
    await page.getByLabel("Description", { exact: true }).inputValue(),
    "Draft kept during refresh",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Draft kept during refresh", { exact: true }).waitFor();
  await mkdir("/tmp/tr-library-evidence", { recursive: true });
  await page.screenshot({
    path: "/tmp/tr-library-evidence/detail.png",
    fullPage: true,
  });
  await page.locator(".music-occurrences summary").first().click();
  await page
    .locator(".music-occurrences")
    .getByRole("button", { name: "Add to playlist", exact: true })
    .first()
    .click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("button", { name: "Create a playlist", exact: true })
    .click();
  await picker.getByLabel("Name", { exact: true }).fill("Created from picker");
  await picker
    .getByRole("button", { name: "Create playlist", exact: true })
    .click();
  await picker.waitFor({ state: "hidden" });
  let chosen = (await api("/api/library/playlists", a.token)).items.find(
    (item) => item.name === "Created from picker",
  );
  assert.equal(chosen.items.length, 1);
  assert.equal(chosen.visibility, "private");
  for (const track of [first, second])
    await api(
      "/api/library/collections/track/" + track.id,
      a.token,
      "PUT",
      undefined,
      204,
    );
  await page.getByRole("button", { name: "Liked tracks", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("checkbox").first().check();
  await page.getByRole("checkbox").nth(1).check();
  await page
    .getByRole("button", { name: "Add selection to playlist (2)", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await picker
    .getByRole("button", { name: /Created from picker.*tracks?/ })
    .click();
  await picker.waitFor({ state: "hidden" });
  chosen = await api(`/api/library/playlists/${chosen.id}`, a.token);
  assert.equal(chosen.items.length, 3);
  if (first.projectId) {
    await api(
      "/api/library/collections/project/" + first.projectId,
      a.token,
      "PUT",
      undefined,
      204,
    );
    const project = await api("/api/catalog/projects/" + first.projectId);
    await page
      .getByRole("button", { name: "Saved projects", exact: true })
      .click();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page
      .getByRole("button", { name: "Add project to playlist", exact: true })
      .click();
    page.once("dialog", (dialog) => dialog.accept());
    await picker
      .getByRole("button", { name: /Created from picker.*tracks?/ })
      .click();
    await picker.waitFor({ state: "hidden" });
    chosen = await api(`/api/library/playlists/${chosen.id}`, a.token);
    assert.deepEqual(
      chosen.items.slice(-project.tracks.length).map((item) => item.trackId),
      project.tracks.map((track) => track.id),
    );
  }
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page
    .getByRole("heading", { name: "Recently played", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "[LIBRARY] PASS navigation, covers, retained filters, undo, pointer/keyboard order, full queue, lost replies, picker creation, multi-select, whole project, dirty form and history",
  );
} finally {
  await browser.close();
}
