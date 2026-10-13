import assert from 'node:assert/strict';
import { defineConfig } from '@playwright/test';
const baseURL = process.env.FILES_BASE_URL ?? 'https://127.0.0.1:1443';
assert.equal(new URL(baseURL).href, 'https://127.0.0.1:1443/');
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.mjs', timeout: 120_000,
  expect: { timeout: 15_000 }, retries: 0, workers: 1, reporter: 'line',
  outputDir: './test-results',
  use: { browserName: 'chromium', baseURL, headless: true, ignoreHTTPSErrors: true,
    actionTimeout: 15_000, trace: 'off', video: 'off', screenshot: 'only-on-failure' },
});
