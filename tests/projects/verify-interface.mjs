/** Vérifie la stabilité de la barre et des pochettes dans la pile isolée HTTPS 5445. */
import assert from "node:assert/strict";
import { chromium } from "../files/node_modules/playwright/index.mjs";
/** Origine de test fixe : aucun accès aux données de développement. */
const base = "https://127.0.0.1:5445";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    locale: "en-US", ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
  });
  const projects = await (
    await context.request.get(base + "/api/catalog/projects?page=1&pageSize=24")
  ).json();
  const project = projects.items.find((item) => item.tracks.length > 1);
  assert(project, "Run verify-projects first");
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  /** Retarde uniquement les octets audio afin d’observer un vrai chargement. */
  await page.route("**/api/media/assets/*/audio", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.route("**/artwork", (route) => route.abort());
  await page.goto(base + "/#/projects/" + project.id);
  await page.getByRole("button", { name: "Play project", exact: true }).click();
  const bar = page.locator(".music-player-bar");
  await page.locator(".player-loading-ring").waitFor({ state: "attached" });
  const height = (await bar.boundingBox()).height;
  await page.waitForTimeout(300);
  assert.equal(
    await page
      .locator(".player-loading-ring")
      .evaluate((e) => getComputedStyle(e).opacity),
    "1",
  );
  assert.equal((await bar.boundingBox()).height, height);
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
  assert.equal((await bar.boundingBox()).height, height);
  assert.equal(await page.locator(".player-loading-ring").count(), 0);
  assert.equal(await page.locator(".player-notice").count(), 0);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  /** Contrôle le centre géométrique et le débordement dans les cartes, lignes et file. */
  for (const width of [1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    const boxes = await page.locator(".empty-artwork").evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect(),
          svg = element.querySelector("svg").getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          dx: Math.abs((svg.left + svg.right - box.left - box.right) / 2),
          dy: Math.abs((svg.top + svg.bottom - box.top - box.bottom) / 2),
          fits:
            svg.left >= box.left &&
            svg.right <= box.right &&
            svg.top >= box.top &&
            svg.bottom <= box.bottom,
        };
      }),
    );
    assert(boxes.length >= 4);
    assert(
      boxes.every((box) => box.fits && box.dx < 1 && box.dy < 1),
      JSON.stringify(boxes),
    );
  }
  await page.screenshot({ path: "/tmp/music-interface.png", fullPage: true });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Next track", exact: true }).click();
  await page.locator(".player-loading-ring").waitFor({ state: "attached" });
  await page
    .getByRole("button", { name: "Close audio player", exact: true })
    .click();
  await page.waitForTimeout(1400);
  assert.equal(await bar.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "[INTERFACE] PASS delayed audio, stable player height, cancellation on close",
  );
} finally {
  await browser.close();
}
