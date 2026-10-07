import assert from 'node:assert/strict';
import https from 'node:https';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const base = new URL(process.env.E2E_BASE_URL ?? 'https://127.0.0.1:2443');
assert.equal(base.protocol, 'https:', 'E2E requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Only loopback E2E URLs are allowed');
assert.ok(base.port && !['1443', '443'].includes(base.port), 'Refusing development/default HTTPS ports');
assert.ok(!base.username && !base.password && base.pathname === '/' && !base.search, 'Invalid E2E base URL');
const [mode = 'initial', stateFile = '/tmp/transcendence-e2e-state.json'] = process.argv.slice(2);
const password = 'Pce-test-only-password-2026';
const email = 'pce_api@example.invalid';
const values = { displayName: 'PCE confirmed', username: 'pce_updated', bio: 'Persisted PCE biography' };
const avatarBytes = await readFile(new URL('./fixtures/avatar.png', import.meta.url));
const publicKeys = ['avatarUrl', 'bio', 'displayName', 'userId', 'username'];
let phase = 'readiness';

export function request(path, { method = 'GET', token, json, bytes, contentType } = {}) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'), 'Request must stay on the E2E origin');
  const payload = json === undefined ? bytes : Buffer.from(JSON.stringify(json));
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, base), {
      method, rejectUnauthorized: false, // Only this isolated loopback connection.
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'content-type': contentType ?? 'application/json', 'content-length': payload.length } : {}),
      },
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        let data = null;
        if (String(res.headers['content-type']).includes('application/json')) {
          try { data = JSON.parse(body.toString()); }
          catch { return reject(new Error('Invalid JSON response')); }
        }
        resolve({ status: res.statusCode, headers: res.headers, bytes: body, data });
      });
      res.on('error', reject);
    });
    req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function expect(response, status, code) {
  assert.equal(response.status, status, `Expected HTTP ${status}, received ${response.status}`);
  if (code) assert.equal(response.data?.code, code, `Expected business code ${code}`);
  return response.data;
}
function dto(profile) {
  assert.deepEqual(Object.keys(profile).sort(), publicKeys, 'Unexpected public profile keys');
}
function multipart(bytes, mime = 'image/png') {
  const boundary = 'pce-e2e-fixture-boundary';
  return { contentType: `multipart/form-data; boundary=${boundary}`, bytes: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="avatar.png"\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]) };
}
async function ready() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const responses = await Promise.all(['/api/auth/ready', '/api/users/ready', '/'].map(path => request(path)));
      if (responses.every(r => r.status === 200)) return;
    } catch { /* bounded retry while the isolated stack starts */ }
    await delay(1000);
  }
  throw new Error('HTTPS readiness not reached within 60 attempts');
}
async function login(accountEmail = email) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const r = await request('/api/auth/login', { method: 'POST', json: { email: accountEmail, password } });
    if (r.status === 202) {
      expect(r, 202, 'REGISTRATION_PENDING');
      await delay(3000);
      continue;
    }
    const data = expect(r, 200);
    assert.equal(typeof data.token, 'string', 'JWT missing');
    return data.token;
  }
  throw new Error('Registration remains pending after 10 login attempts');
}
async function verify(token, state) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  assert.equal(claims.sub, state.userId, 'JWT and profile UUID differ');
  const profile = expect(await request('/api/users/me', { token }), 200);
  dto(profile);
  assert.deepEqual(profile, state.profile, 'Profile changed or was not persisted');
  assert.ok(profile.avatarUrl.startsWith('/api/users/avatars/'), 'Unexpected avatar URL');
  const image = await request(profile.avatarUrl);
  expect(image, 200);
  assert.equal(image.headers['content-type'], 'image/png');
  assert.deepEqual(image.bytes, avatarBytes, 'Avatar bytes changed or disappeared');
}

async function main() {
  await ready();
  console.log('[PCE HTTP] PASS readiness');
  if (mode === 'initial') {
    phase = 'signup';
    const signup = await request('/api/auth/signup', { method: 'POST', json: {
      email, password, username: ' PCE_API ', displayName: ' PCE initial ',
    } });
    assert.ok([201, 202].includes(signup.status), `Signup returned HTTP ${signup.status}`);
    if (signup.status === 202) expect(signup, 202, 'REGISTRATION_PENDING');
    else assert.equal(signup.data.status, 'registered');
    console.log('[PCE HTTP] PASS signup');
    phase = 'login and identity';
    const token = await login();
    const initial = expect(await request('/api/users/me', { token }), 200);
    dto(initial);
    assert.equal(initial.username, 'pce_api');
    assert.equal(initial.displayName, 'PCE initial');
    assert.match(initial.userId, /^[0-9a-f-]{36}$/);
    if (signup.status === 201) assert.equal(signup.data.userId, initial.userId);
    console.log('[PCE HTTP] PASS login and canonical identity');
    phase = 'text update';
    const edited = expect(await request('/api/users/me/profile', { method: 'PUT', token, json: values }), 200);
    dto(edited);
    assert.equal(edited.userId, initial.userId);
    for (const [key, value] of Object.entries(values)) assert.equal(edited[key], value);
    console.log('[PCE HTTP] PASS text update');
    phase = 'avatar and reread';
    const uploaded = expect(await request('/api/users/me/avatar', { method: 'POST', token, ...multipart(avatarBytes) }), 200);
    dto(uploaded);
    assert.equal(uploaded.userId, initial.userId);
    const state = { email, userId: initial.userId, profile: uploaded };
    await verify(token, state);
    await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
    console.log('[PCE HTTP] PASS avatar bytes, public DTO and UUID');
  } else if (mode === 'verify') {
    phase = 'persisted reread';
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    await verify(await login(state.email), state);
    console.log('[PCE HTTP] PASS persisted login, profile and avatar');
  } else {
    throw new Error('Unknown scenario mode');
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Assertions can contain actual values; emit only a diagnostic phase and type.
    console.error(`[PCE HTTP] FAIL ${phase}: ${error.code ?? error.name}`);
    process.exitCode = 1;
  });
}
