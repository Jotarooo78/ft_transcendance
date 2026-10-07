import assert from 'node:assert/strict';
import { defineConfig } from '@playwright/test';
const baseURL=process.env.MUSIC_BASE_URL ?? 'https://127.0.0.1:3443';
assert.equal(new URL(baseURL).href,'https://127.0.0.1:3443/','Music browser tests require the isolated loopback gateway');
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.mjs', timeout: 90000,
  expect: { timeout: 10000 }, retries: 0, workers: 1, reporter: 'line',
  outputDir: './test-results',
  use: { browserName:'chromium', baseURL, headless:true, ignoreHTTPSErrors:true,
    actionTimeout:10000, trace:'off', video:'off', screenshot:'only-on-failure' },
});
