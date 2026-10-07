import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const mutationProbe = process.env.PCE_MUTATION_CHECK === '1';
const username = mutationProbe ? 'pce_browser_probe' : 'pce_browser';
const email = `${username}@example.invalid`;
const password = 'Pce-browser-test-only-2026';
const avatar = fileURLToPath(new URL('./fixtures/avatar.png', import.meta.url));
const avatarBytes = await readFile(avatar);
const publicKeys = ['avatarUrl', 'bio', 'displayName', 'userId', 'username'];
const values = { displayName: 'PCE browser saved', username: `${username}_new`, bio: 'Browser persistence proof' };

function responseFor(page, path, method) {
  return page.waitForResponse(r => new URL(r.url()).pathname === path && r.request().method() === method);
}
async function login(page) {
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  for (let attempt = 0; attempt < 10; attempt++) {
    const responsePromise = responseFor(page, '/api/auth/login', 'POST');
    const mePromise = responseFor(page, '/api/users/me', 'GET');
    // A pending login has no /me request: don't leave a rejected waiter behind.
    mePromise.catch(() => {});
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    const response = await responsePromise;
    if (response.status() === 202) {
      const pending = await response.json();
      expect(pending.code).toBe('REGISTRATION_PENDING');
      await expect(page.getByRole('alert')).toContainText('registration is still in progress');
      // The delay comes from the server contract, rather than a guessed UI delay.
      await page.waitForTimeout(Math.min(pending.retryAfterSeconds, 3) * 1000);
      continue;
    }
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(typeof result.token).toBe('string');
    const profileResponse = await mePromise;
    expect(profileResponse.status()).toBe(200);
    const profile = await profileResponse.json();
    expect(Object.keys(profile).sort()).toEqual(publicKeys);
    const claims = JSON.parse(Buffer.from(result.token.split('.')[1], 'base64url').toString());
    expect(claims.sub).toBe(profile.userId);
    await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
    return profile;
  }
  throw new Error('Browser registration still pending after ten attempts');
}
async function renderedProfile(page, profile) {
  await expect(page.getByRole('heading', { name: profile.displayName, exact: true })).toBeVisible();
  await expect(page.getByText(`@${profile.username}`, { exact: true })).toBeVisible();
  if (profile.bio) await expect(page.getByText(profile.bio, { exact: true })).toBeVisible();
  const image = page.getByRole('img', { name: `${profile.displayName}'s avatar`, exact: true });
  if (profile.avatarUrl) {
    await expect(image).toHaveAttribute('src', profile.avatarUrl);
    await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
    const response = await page.request.get(profile.avatarUrl);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    assert.deepEqual(await response.body(), avatarBytes);
  }
}
async function fillEdit(page, fields) {
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill(fields.displayName);
  await page.getByLabel('Username', { exact: true }).fill(fields.username);
  await page.getByRole('textbox', { name: 'Bio', exact: true }).fill(fields.bio);
}

// Use the shipped UI and the real HTTPS gateway for every successful mutation.
test('user journey persists through reload, relogin and controlled refusals', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill(username.toUpperCase());
  await page.getByLabel('Display name', { exact: true }).fill('PCE browser initial');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  const signupPromise = responseFor(page, '/api/auth/signup', 'POST');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  const signup = await signupPromise;
  expect([201, 202]).toContain(signup.status());
  await expect(page.getByRole('heading', { name: signup.status() === 201 ? 'Account created' : 'Registration in progress', exact: true })).toBeVisible();
  const initial = await login(page);
  expect(initial.username).toBe(username);
  expect(initial.bio).toBeNull();
  expect(initial.avatarUrl).toBeNull();
  if (signup.status() === 201) expect((await signup.json()).userId).toBe(initial.userId);
  await renderedProfile(page, initial);

  if (mutationProbe) {
    await page.route('**/api/users/me/profile', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...initial, ...values }),
    }));
  }
  await fillEdit(page, values);
  await page.getByLabel('Choose an avatar').setInputFiles(avatar);
  const textPromise = responseFor(page, '/api/users/me/profile', 'PUT');
  const uploadPromise = responseFor(page, '/api/users/me/avatar', 'POST');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  const text = await textPromise;
  expect(text.status()).toBe(200);
  const savedText = await text.json();
  expect(savedText.userId).toBe(initial.userId);
  for (const [key, value] of Object.entries(values)) expect(savedText[key]).toBe(value);
  const uploadedResponse = await uploadPromise;
  expect(uploadedResponse.status()).toBe(200);
  const uploaded = await uploadedResponse.json();
  const confirmed = { ...savedText, avatarUrl: uploaded.avatarUrl };
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
  await renderedProfile(page, confirmed);

  // The JWT is intentionally in memory: reload requires the normal login form.
  await page.reload();
  const afterReload = await login(page);
  await test.step('persisted profile after reload', async () => {
    expect(afterReload).toEqual(confirmed);
    await renderedProfile(page, afterReload);
  });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  const afterLogout = await login(page);
  expect(afterLogout).toEqual(confirmed);
  await renderedProfile(page, afterLogout);

  // Occupied username exists from the API scenario. The server must refuse it.
  await fillEdit(page, { ...values, username: 'pce_updated' });
  const conflictPromise = responseFor(page, '/api/users/me/profile', 'PUT');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect((await conflictPromise).status()).toBe(409);
  await expect(page.getByRole('alert')).toContainText('username already in use');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await renderedProfile(page, confirmed);

  // Change only the outgoing multipart MIME, so the real Users server rejects it
  // after accepting the preceding text request. This bypasses the client guard.
  const partial = { ...values, displayName: 'PCE text saved despite avatar', bio: 'Confirmed partial save' };
  await fillEdit(page, partial);
  await page.getByLabel('Choose an avatar').setInputFiles(avatar);
  await page.route('**/api/users/me/avatar', route => {
    const req = route.request();
    const bytes = req.postDataBuffer();
    assert.ok(bytes);
    const altered = Buffer.from(bytes.toString('latin1').replace('Content-Type: image/png', 'Content-Type: text/plain'), 'latin1');
    const headers = { ...req.headers() };
    delete headers['content-length'];
    return route.continue({ postData: altered, headers });
  });
  const partialTextPromise = responseFor(page, '/api/users/me/profile', 'PUT');
  const refusedAvatarPromise = responseFor(page, '/api/users/me/avatar', 'POST');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect((await partialTextPromise).status()).toBe(200);
  expect((await refusedAvatarPromise).status()).toBe(415);
  await expect(page.getByRole('alert')).toContainText('Texte sauvegardé, avatar non envoyé');
  await expect(page.getByRole('heading', { name: partial.displayName, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
  const serverProfile = await page.request.get('/api/users/me', {
    headers: { authorization: (await partialTextPromise).request().headers()['authorization'] },
  });
  expect(serverProfile.status()).toBe(200);
  const expectedPartial = { ...confirmed, ...partial };
  expect(await serverProfile.json()).toEqual(expectedPartial);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await renderedProfile(page, expectedPartial);
  await page.reload();
  expect(await login(page)).toEqual(expectedPartial);
  await renderedProfile(page, expectedPartial);
});
