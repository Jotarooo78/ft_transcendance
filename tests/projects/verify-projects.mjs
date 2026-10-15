/** Preuves HTTPS, PostgreSQL et Chromium de publication, sans données ni compte de développement. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "../files/node_modules/playwright/index.mjs";

/** Origine fixe et projet isolé : ce scénario ne peut pas cibler la pile de développement. */
const base = "https://127.0.0.1:5445";
const args = [
  "compose",
  "-p",
  "transcendence_projects",
  "--env-file",
  "/dev/null",
  "-f",
  "tests/music/compose.yml",
  "-f",
  "tests/projects/compose.yml",
];
if (process.env.PROJECTS_TEST_COMPOSE_OVERRIDE)
  args.push("-f", process.env.PROJECTS_TEST_COMPOSE_OVERRIDE);
const password = "Publication-test-only-password-2026";
/** Exécute exclusivement une commande dans la pile isolée. */
const compose = (command, input) =>
  execFileSync("docker", [...args, ...command], {
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
/** Vérifie le nom de base et interrompt au premier échec SQL. */
const sql = (query) =>
  compose(
    [
      "exec",
      "-T",
      "db",
      "psql",
      "-XAtq",
      "-U",
      "e2e_admin",
      "-d",
      "transcendence_music",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    `DO $$ BEGIN IF current_database()<>'transcendence_music' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;\n${query}`,
  );
/** Autorise seulement les UUID contrôlés dans les requêtes SQL de preuve. */
const uuid = (value) => {
  assert.match(value, /^[a-f0-9-]{36}$/i);
  return value;
};
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
/** Envoie la requête et exige son statut avant de lire son JSON. */
async function api(
  path,
  { token, method = "GET", data, multipart, status = 200 } = {},
) {
  const r = await context.request.fetch(base + path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    data,
    multipart,
    timeout: 330000,
  });
  assert.equal(
    r.status(),
    status,
    `${method} ${path}: ${r.status()} ${await r.text()}`,
  );
  return status === 204 ? null : r.json();
}
/** Crée un vrai compte Auth/Users, avec attente bornée du provisionnement de profil. */
async function account(suffix) {
  const username = `pub_${randomUUID().replaceAll("-", "").slice(0, 10)}_${suffix}`,
    email = `${username}@example.invalid`;
  const r = await context.request.post(base + "/api/auth/signup", {
    data: { username, email, password, displayName: `Artist ${suffix}` },
  });
  assert([201, 202].includes(r.status()));
  for (let i = 0; i < 20; i++) {
    const login = await context.request.post(base + "/api/auth/login", {
      data: { email, password },
    });
    if (login.status() === 202) {
      await delay(500);
      continue;
    }
    assert.equal(login.status(), 200);
    const { token } = await login.json();
    const profile = await api("/api/users/me", { token });
    return { ...profile, token, email };
  }
  throw Error("Profile provisioning timed out");
}
/** Produit les petits témoins avec les vrais décodeurs présents dans l’image Media. */
function fixtures() {
  return JSON.parse(
    compose(
      ["exec", "-T", "media-service", "node", "--input-type=module"],
      `
 import sharp from 'sharp'; import {demoAudio} from './dist/seed/audio-fixture.js'; import {writeFile,readFile,rm} from 'node:fs/promises'; import {execFileSync} from 'node:child_process';
 const png=await sharp({create:{width:64,height:64,channels:3,background:'#ff5500'}}).png().toBuffer();
 const wav=demoAudio(2);await writeFile('/tmp/pub.wav',wav);await writeFile('/tmp/pub.png',png);
 execFileSync('ffmpeg',['-v','error','-y','-i','/tmp/pub.wav','-i','/tmp/pub.png','-map','0:a','-map','1:v','-c:a','libmp3lame','-c:v','copy','-disposition:v','attached_pic','/tmp/pub.mp3']);
 console.log(JSON.stringify({wav:wav.toString('base64'),png:png.toString('base64'),mp3:(await readFile('/tmp/pub.mp3')).toString('base64')}));
 await Promise.all(['/tmp/pub.wav','/tmp/pub.png','/tmp/pub.mp3'].map(p=>rm(p)));
 `,
    ),
  );
}
/** Transfère un vrai fichier provisoire, sans passer par un simulacre de serveur. */
async function upload(token, bytes, mime = "audio/mpeg") {
  return api("/api/media/assets?temporary=1", {
    token,
    method: "POST",
    multipart: { file: { name: "track", mimeType: mime, buffer: bytes } },
    status: 201,
  });
}
/** Connecte le compte dans la vraie interface. */
async function signIn(page, a) {
  await page.goto(base);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(a.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).waitFor();
}
/** Attend un résultat observable en laissant le navigateur traiter ses événements. */
async function until(action) {
  for (let i = 0; i < 50; i++) {
    if (await action()) return;
    await delay(200);
  }
  throw Error("Observation timed out");
}
try {
  const a = await account("a"),
    b = await account("b");
  const f = fixtures();
  const wav = Buffer.from(f.wav, "base64"),
    png = Buffer.from(f.png, "base64");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, a);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page.getByRole("button", { name: "Album", exact: true }).click();
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Evening windows");
  await page.getByLabel("Audio files", { exact: true }).setInputFiles(
    ["First light", "Soft steps", "Last train"].map((title) => ({
      name: title + ".wav",
      mimeType: "audio/wav",
      buffer: wav,
    })),
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).waitFor();
  await until(
    async () =>
      !(await page
        .getByRole("button", { name: "Save draft", exact: true })
        .isDisabled()),
  );
  await page
    .getByRole("button", { name: "Move track 3 up", exact: true })
    .click();
  await page
    .getByLabel("Cover image", { exact: true })
    .setInputFiles({ name: "artwork.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText("Draft saved. You can come back later.", { exact: true })
    .waitFor();
  let projects = await api("/api/catalog/me/projects", { token: a.token });
  let project = projects.items.find((p) => p.title === "Evening windows");
  assert(project);
  assert.deepEqual(
    project.tracks.map((t) => t.title),
    ["First light", "Last train", "Soft steps"],
  );
  assert.equal(project.status, "draft");
  await api(`/api/catalog/projects/${project.id}`, { status: 404 });
  await api(`/api/catalog/me/projects/${project.id}`, {
    token: b.token,
    status: 404,
  });
  for (const track of project.tracks)
    await api(`/api/catalog/tracks/${track.id}`, { status: 404 });
  compose(["restart", "catalog-service", "library-service"]);
  await until(async () => {
    try {
      return (await context.request.get(base + "/api/catalog/ready")).ok();
    } catch {
      return false;
    }
  });
  await signIn(page, a);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await page
    .getByRole("button", { name: "Evening windows album · draft", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Track 2 title", { exact: true }).inputValue(),
    "Last train",
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page
    .getByRole("button", { name: "View in catalogue", exact: true })
    .waitFor();
  project = await api(`/api/catalog/projects/${project.id}`);
  assert.equal(project.status, "published");
  assert(project.releaseDate);
  assert(project.coverUrl);
  const releaseDate = project.releaseDate;
  await page
    .getByRole("button", { name: "Move track 3 up", exact: true })
    .click();
  await page
    .getByLabel("Project title", { exact: true })
    .fill("Evening windows — final");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await until(async () =>
    (await api(`/api/catalog/projects/${project.id}`)).title.endsWith("final"),
  );
  project = await api(`/api/catalog/projects/${project.id}`);
  assert.equal(project.releaseDate, releaseDate);
  assert.deepEqual(
    project.tracks.map((t) => t.title),
    ["First light", "Soft steps", "Last train"],
  );
  await page
    .getByRole("button", { name: "View in catalogue", exact: true })
    .click();
  await page
    .getByRole("heading", { name: project.title, exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await page
    .getByRole("button", { name: "Unsave project", exact: true })
    .waitFor();
  const track = project.tracks[0];
  await page
    .getByRole("button", { name: "Like track", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Unlike track", exact: false })
    .waitFor();
  await page.goto(base + `/#/artists/${a.userId}`);
  await page
    .getByRole("button", { name: "Follow artist", exact: false })
    .click();
  await page
    .getByRole("button", { name: "Unfollow artist", exact: false })
    .waitFor();
  assert.equal(
    (await api("/api/library/collections/project", { token: a.token })).total,
    1,
  );
  assert.equal(
    (await api("/api/library/collections/track", { token: a.token })).total,
    1,
  );
  assert.equal(
    (await api("/api/library/collections/artist", { token: a.token })).total,
    1,
  );
  assert.equal(
    (await api("/api/library/collections/project", { token: b.token })).total,
    0,
  );
  assert.equal(
    (await api("/api/users/friends", { token: a.token })).friends.length,
    0,
  );
  console.log(
    "[PROJECTS] PASS multi-upload, ordering, artwork, draft privacy, restart, publication and independent collections",
  );
  const titleQuery = await api("/api/catalog/projects?q=Evening%20windows");
  assert(titleQuery.items.some((p) => p.id === project.id));
  const artistQuery = await api(
    "/api/users/artists?q=" + encodeURIComponent(a.username),
  );
  assert(artistQuery.items.some((p) => p.userId === a.userId));
  const tracks = await api("/api/catalog/tracks?sort=recent");
  assert(tracks.items.some((t) => t.id === track.id));
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByText("First light", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Saved projects", exact: true })
    .click();
  await page
    .getByRole("button", { name: project.title, exact: false })
    .waitFor();
  await page.getByRole("button", { name: "My playlists", exact: true }).click();
  const form = page.locator("form.playlist-form");
  assert.equal(
    await form.getByLabel("Visibility", { exact: true }).inputValue(),
    "private",
  );
  await form.getByLabel("Name", { exact: true }).fill("Night drive");
  await form
    .getByRole("button", { name: "Create playlist", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Tracks in Night drive", exact: true })
    .waitFor();
  let playlist = (
    await api("/api/library/playlists", { token: a.token })
  ).items.find((p) => p.name === "Night drive");
  assert.equal(playlist.visibility, "private");
  playlist = await api(`/api/library/playlists/${playlist.id}/items`, {
    method: "POST",
    token: a.token,
    data: { trackId: track.id, expectedVersion: playlist.version },
  });
  await api(`/api/library/public/playlists/${playlist.id}`, { status: 404 });
  await returnToTab(page);
  await page.locator(`[data-item-id="${playlist.items[0].id}"]`).waitFor();
  await page
    .getByRole("button", { name: "Edit playlist", exact: true })
    .click();
  await page
    .getByRole("form", { name: "Edit playlist" })
    .getByLabel("Visibility", { exact: true })
    .selectOption("public");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await api(`/api/library/public/playlists/${playlist.id}`, { status: 404 });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Playlist saved · public.", { exact: true }).waitFor();
  playlist = await api(`/api/library/public/playlists/${playlist.id}`);
  assert.equal(playlist.items.length, 1);
  await api(`/api/library/playlists/${playlist.id}`, {
    token: b.token,
    method: "PATCH",
    data: { name: "Intrusion", expectedVersion: playlist.version },
    status: 404,
  });
  await api(`/api/library/collections/playlist/${playlist.id}`, {
    token: b.token,
    method: "PUT",
    status: 204,
  });
  const guestContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const guest = await guestContext.newPage();
  await guest.goto(base + `/#/playlists/${playlist.id}`);
  await guest
    .getByRole("heading", { name: "Night drive", exact: true })
    .waitFor();
  assert.equal(
    await guest
      .getByRole("button", { name: "Edit playlist", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Edit playlist", exact: true })
    .click();
  await page
    .getByRole("form", { name: "Edit playlist" })
    .getByLabel("Visibility", { exact: true })
    .selectOption("private");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Playlist saved · private.", { exact: true }).waitFor();
  await api(`/api/library/public/playlists/${playlist.id}`, { status: 404 });
  await guest.evaluate(() => window.dispatchEvent(new Event("focus")));
  await guest
    .getByRole("alert")
    .filter({ hasText: "no longer available" })
    .waitFor();
  assert.equal(
    await guest
      .getByRole("heading", { name: "Night drive", exact: true })
      .count(),
    0,
  );
  await api(`/api/library/collections/playlist/${playlist.id}`, {
    token: b.token,
    method: "DELETE",
    status: 204,
  });
  await guestContext.close();
  console.log(
    "[PROJECTS] PASS playlist private default, confirmed sharing, guest URL, owner rights and revocation",
  );
  for (let i = 0; i < 2; i++) {
    const session = await api("/api/playback/sessions", {
      token: a.token,
      method: "POST",
      data: { trackId: track.id },
      status: 201,
    });
    await api(`/api/playback/sessions/${session.id}/close`, {
      token: a.token,
      method: "POST",
    });
  }
  const history = await api("/api/playback/sessions", { token: a.token });
  assert.equal(
    history.items.filter((item) => item.trackId === track.id).length,
    2,
  );
  assert(history.items[0].startedAt >= history.items[1].startedAt);
  assert.equal(
    (await api("/api/playback/sessions", { token: b.token })).total,
    0,
  );
  await page.getByRole("button", { name: "History", exact: true }).click();
  await until(
    async () => (await page.locator("[data-session-id]").count()) === 2,
  );
  await mkdir("/tmp/tr-projects-evidence", { recursive: true });
  await page.screenshot({
    path: "/tmp/tr-projects-evidence/history.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page.getByRole("heading", { name: "Artists", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Tracks", exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/tr-projects-evidence/catalog.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.getByText("First light", { exact: true }).waitFor();
  await page.screenshot({
    path: "/tmp/tr-projects-evidence/library.png",
    fullPage: true,
  });
  await page.goto(base + `/#/projects/${project.id}`);
  await page.getByRole("button", { name: "Play project", exact: true }).click();
  await until(async () =>
    (await api("/api/playback/sessions", { token: a.token })).items.some(
      (item) => item.trackId === project.tracks[1].id,
    ),
  );
  // Les autres types empruntent le même parcours ; un brouillon ancien publié maintenant est récent.
  for (const releaseType of ["single", "ep", "mixtape"]) {
    const asset = await upload(a.token, wav, "audio/wav"),
      id = randomUUID();
    const body = {
      title: releaseType,
      releaseType,
      description: "",
      coverAssetId: null,
      tracks: [{ audioAssetId: asset.id, title: releaseType + " track" }],
      expectedVersion: 0,
    };
    let draft = await api(`/api/catalog/me/projects/${id}`, {
      method: "PUT",
      token: a.token,
      data: body,
    });
    sql(
      `UPDATE catalog.releases SET created_at=now()-interval '1 year' WHERE id='${uuid(id)}';`,
    );
    draft = await api(`/api/catalog/me/projects/${id}/publish`, {
      method: "POST",
      token: a.token,
      data: { expectedVersion: draft.version },
    });
    assert.equal(draft.releaseType, releaseType);
    assert.equal((await api("/api/catalog/projects")).items[0].id, id);
  }
  const abandoned = await upload(a.token, wav, "audio/wav"),
    abandonedId = randomUUID();
  const draft = await api(`/api/catalog/me/projects/${abandonedId}`, {
    method: "PUT",
    token: a.token,
    data: {
      title: "Discard me",
      releaseType: "ep",
      description: "",
      coverAssetId: null,
      tracks: [{ audioAssetId: abandoned.id, title: "Discard" }],
      expectedVersion: 0,
    },
  });
  await api(`/api/catalog/me/projects/${abandonedId}`, {
    method: "DELETE",
    token: a.token,
    data: { expectedVersion: draft.version },
    status: 204,
  });
  assert.equal(
    sql(
      `SELECT state FROM media.assets WHERE id='${uuid(abandoned.id)}';`,
    ).trim(),
    "deleted",
  );
  console.log(
    "[PROJECTS] PASS single, EP, mixtape, first-publication ordering and draft cleanup",
  );
  assert.deepEqual(errors, []);
  console.log(
    "[PROJECTS] PASS history repeats and privacy, catalogue sections, shared library and continuous playback",
  );
} catch (error) {
  await mkdir("/tmp/tr-projects-evidence", { recursive: true });
  for (const [index, page] of context.pages().entries()) {
    await page.screenshot({
      path: `/tmp/tr-projects-evidence/failure-${index}.png`,
      fullPage: true,
    });
    console.error((await page.locator("body").innerText()).slice(0, 5000));
  }
  throw error;
} finally {
  await context.close();
  await browser.close();
}

/** Simule le retour sur l’onglet après la fenêtre de fusion focus/visibility. */
async function returnToTab(page) {
  await page.waitForTimeout(550);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}
