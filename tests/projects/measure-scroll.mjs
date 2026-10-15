/** Mesure indicative de défilement natif, avec fixtures reproductibles ; ne remplace pas un trackpad réel.
 * Usage : node tests/projects/measure-scroll.mjs /tmp/mesure.json [répertoire-dist]
 * La pile 5445 doit contenir les publications de verify-projects ; aucun endpoint de développement.
 */
import { resolve, extname } from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "../files/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";
const base = "https://127.0.0.1:5445";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({
  locale: "en-US", ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 800 },
});
const email = `scroll_${Date.now()}@example.invalid`,
  password = "Scroll-test-only-2026";
await ctx.request.post(base + "/api/auth/signup", {
  data: {
    email,
    password,
    username: "scroll_" + Date.now(),
    displayName: "Scroll test",
  },
});
await new Promise((r) => setTimeout(r, 1200));
const page = await ctx.newPage();
/** Une distribution optionnelle sert les vrais fichiers compilés, les API restent celles de test. */
const distribution = process.argv[3] !== "-" ? process.argv[3] : undefined;
if (distribution) {
  await page.route(base + "/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname !== "/" && !pathname.startsWith("/assets/"))
      return route.continue();
    const file = resolve(
      distribution,
      pathname === "/" ? "index.html" : "." + pathname,
    );
    if (!file.startsWith(resolve(distribution) + "/"))
      throw Error("Invalid asset path");
    const contentType =
      { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }[
        extname(file)
      ] ?? "application/octet-stream";
    return route.fulfill({ body: await readFile(file), contentType });
  });
}
const tracks = (
  await (
    await ctx.request.get(
      base + "/api/catalog/tracks?page=1&pageSize=24&q=&genre=&sort=recent",
    )
  ).json()
).items;
const fixture = Array.from({ length: 48 }, (_, i) => ({
  ...tracks[i % tracks.length],
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  title: `Scroll fixture ${i}`,
  coverUrl: null,
}));
await page.route("**/api/catalog/tracks?*", (route) =>
  route.fulfill({
    json: {
      items: fixture.slice(0, 24),
      total: 48,
      page: 1,
      pageSize: 24,
      genres: [],
    },
  }),
);
await page.route("**/api/catalog/tracks/*", (route) => {
  const track = fixture.find((t) => route.request().url().endsWith(t.id));
  return track ? route.fulfill({ json: track }) : route.continue();
});
await page.route("**/api/library/collections/track?*", (route) =>
  route.fulfill({
    json: {
      items: fixture.map((t) => ({
        id: t.id,
        createdAt: "2026-10-15T10:00:00Z",
      })),
      total: 48,
      page: 1,
      pageSize: 100,
    },
  }),
);
await page.route("**/api/playback/sessions?*", (route) =>
  route.fulfill({
    json: {
      items: fixture.slice(0, 20).map((t, i) => ({
        id: t.id,
        trackId: t.id,
        trackDurationMs: 30000,
        startedAt: new Date(1760000000000 - i * 1000).toISOString(),
        endedAt: null,
        listenedMs: 0,
        lastSequence: 0,
        positionMs: 0,
      })),
      total: 20,
      page: 1,
      pageSize: 20,
    },
  }),
);
const results = [];
/** Échantillonne les images, tâches >50 ms et déplacements pendant trois secondes aller-retour. */
async function measure(name) {
  await page.waitForTimeout(700);
  const metrics = await page.evaluate(async () => {
    const frames = [],
      tasks = [],
      shifts = [];
    const taskObserver = new PerformanceObserver((list) =>
      tasks.push(...list.getEntries().map((e) => e.duration)),
    );
    taskObserver.observe({ type: "longtask" });
    const shiftObserver = new PerformanceObserver((list) =>
      shifts.push(...list.getEntries().map((e) => e.value)),
    );
    shiftObserver.observe({ type: "layout-shift" });
    const height = document.documentElement.scrollHeight,
      duration = 3000;
    let start, last;
    await new Promise((resolve) => {
      function tick(t) {
        start ??= t;
        if (last) frames.push(t - last);
        last = t;
        const p = (t - start) / duration;
        window.scrollTo(0, (height - innerHeight) * Math.sin(p * Math.PI) ** 2);
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    taskObserver.disconnect();
    shiftObserver.disconnect();
    frames.sort((a, b) => a - b);
    return {
      height,
      frames: frames.length,
      p95: frames[Math.floor(frames.length * 0.95)],
      max: Math.max(...frames),
      over25: frames.filter((x) => x > 25).length,
      longTasks: tasks,
      layoutShift: shifts.reduce((a, b) => a + b, 0),
    };
  });
  results.push({ name, ...metrics });
}
try {
  await page.goto(base);
  // Variante diagnostique : supprime seulement le filtre, sans modifier le code de l’application.
  if (process.argv.includes("--without-player-blur"))
    await page.addStyleTag({
      content: ".music-player-bar.audio-player { backdrop-filter: none; }",
    });
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await measure("login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: "Upload", exact: true }).waitFor();
  await measure("profile");
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await page
    .getByRole("button", { name: "See all tracks", exact: true })
    .click();
  await measure("catalog");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await measure("library");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await measure("history");
  const projects = (
    await (
      await ctx.request.get(base + "/api/catalog/projects?page=1&pageSize=24")
    ).json()
  ).items;
  const project = projects.find((item) => item.tracks.length > 1);
  await page.evaluate((id) => (location.hash = "/projects/" + id), project.id);
  await page.getByRole("button", { name: "Play project", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.getByRole("button", { name: "Repeat off", exact: true }).click();
  await page.getByRole("button", { name: "Repeat queue", exact: true }).click();
  /** Profil CPU facultatif pour attribuer les tâches longues ; ses timings ne servent pas de référence. */
  const profiler = process.argv.includes("--profile-js")
    ? await ctx.newCDPSession(page)
    : null;
  if (profiler) {
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.start");
  }
  for (const [button, label] of [
    ["Catalog", "catalog-audio"],
    ["Library", "library-audio"],
    ["History", "history-audio"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    if (button === "Catalog")
      await page
        .getByRole("button", { name: "See all tracks", exact: true })
        .click();
    await measure(label);
  }
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    await writeFile(
      (process.argv[2] ?? "/tmp/scroll") + ".cpuprofile",
      JSON.stringify(profile),
    );
    const top = profile.nodes
      .filter((node) => node.hitCount)
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 20)
      .map((node) => ({
        name: node.callFrame.functionName,
        url: node.callFrame.url.split("/").slice(-1)[0],
        line: node.callFrame.lineNumber,
        hits: node.hitCount,
      }));
    console.log(JSON.stringify({ cpuSamples: top }));
  }
  console.log(JSON.stringify(results));
  await writeFile(
    process.argv[2] ?? "/tmp/scroll-before.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
