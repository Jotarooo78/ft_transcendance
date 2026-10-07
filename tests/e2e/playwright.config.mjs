import assert from 'node:assert/strict';
import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'https://127.0.0.1:2443';
const url = new URL(baseURL);
assert.ok(url.protocol === 'https:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.ok(url.port && !['1443', '443'].includes(url.port), 'Refusing development HTTPS');
assert.ok(!url.username && !url.password && url.pathname === '/' && !url.search);

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.mjs',
  timeout: 90000,
  expect: { timeout: 10000 },
  retries: 0,
  workers: 1,
  reporter: 'line',
  outputDir: './test-results',
  use: {
    browserName: 'chromium', baseURL, headless: true,
    ignoreHTTPSErrors: true,
    actionTimeout: 10000,
    // Traces can retain JWTs and passwords; observe only safe response facts below.
    trace: 'off', screenshot: 'only-on-failure', video: 'off',
  },
});
