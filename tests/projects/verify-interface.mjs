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
    ignoreHTTPSErrors: true,
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
