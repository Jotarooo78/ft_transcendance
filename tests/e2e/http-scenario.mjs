/** Preuve HTTPS réelle de l’inscription, du profil, de la bio et de l’avatar, confinée à la pile de test sur loopback. */
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

/**
 * Origine HTTPS autorisée de la campagne ; les gardes qui suivent empêchent une cible extérieure au
 * périmètre prévu.
 */
const base = new URL(process.env.E2E_BASE_URL ?? 'https://127.0.0.1:2443');
assert.equal(base.protocol, 'https:', 'E2E requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Only loopback E2E URLs are allowed');
assert.ok(base.port && !['1443', '443'].includes(base.port), 'Refusing development/default HTTPS ports');
assert.ok(!base.username && !base.password && base.pathname === '/' && !base.search, 'Invalid E2E base URL');
const [mode = 'initial', stateFile = '/tmp/transcendence-e2e-state.json'] = process.argv.slice(2);
/** Mot de passe public réservé aux comptes jetables de cette campagne ; jamais un secret utilisateur. */
const password = 'Pce-test-only-password-2026';
/** Adresse de fixture sur example.invalid, réservée à ce scénario. */
const email = 'pce_api@example.invalid';
/**
 * Champs de profil de fixture dont la persistance doit être retrouvée après reconnexion ou
 * redémarrage.
 */
const values = { displayName: 'PCE confirmed', username: 'pce_updated', bio: 'Persisted PCE biography' };
/** Octets de référence de l’image fixture, comparés au stockage et aux réponses HTTPS. */
const avatarBytes = await readFile(new URL('./fixtures/avatar.png', import.meta.url));
/**
 * Liste exacte des champs publics attendus dans le profil ; détecte les champs manquants et les
 * fuites.
 */
const publicKeys = ['avatarUrl', 'bio', 'displayName', 'userId', 'username'];
/** Phase courante du scénario, conservée pour identifier le contrôle échoué. */
let phase = 'readiness';

/**
 * Envoie une requête HTTPS sur l’origine de test contrôlée, avec token, JSON ou multipart facultatif.
 * Renvoie statut, en-têtes et octets ; tolère seulement le certificat autosigné de ce test local.
 */
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

/**
 * Exige le statut HTTP et éventuellement le code métier attendus, puis renvoie le JSON pour les autres
 * assertions.
 */
function expect(response, status, code) {
  assert.equal(response.status, status, `Expected HTTP ${status}, received ${response.status}`);
  if (code) assert.equal(response.data?.code, code, `Expected business code ${code}`);
  return response.data;
}
/**
 * Exige exactement les cinq champs publics du profil pour détecter une fuite ou une rupture de
 * contrat.
 */
function dto(profile) {
  assert.deepEqual(Object.keys(profile).sort(), publicKeys, 'Unexpected public profile keys');
}
/**
 * Construit les octets multipart du champ avatar avec une frontière explicite ; permet de tester aussi
 * les MIME refusés.
 */
function multipart(bytes, mime = 'image/png') {
  const boundary = 'pce-e2e-fixture-boundary';
  return { contentType: `multipart/form-data; boundary=${boundary}`, bytes: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="avatar.png"\r\nContent-Type: ${mime}\r\n\r\n`),
    bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]) };
}
/** Attend au plus 60 tentatives que Auth, Users et le frontend répondent par HTTPS. */
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
/**
 * Effectue la vraie connexion du compte de test ; attend de façon bornée pendant pending_profile et
 * renvoie le JWT confirmé.
 */
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
/**
 * Compare UUID JWT, profil persistant et octets exacts de l’avatar aux témoins enregistrés, notamment
 * après redémarrage.
 */
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

/**
 * Exécute le mode demandé : installation initiale, relecture persistante ou refus contrôlés. Écrit les
 * témoins de campagne uniquement dans le fichier d’état local.
 */
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
  } else if (mode === 'negative') {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    const token = await login(state.email);
    await verify(token, state);
    phase = 'duplicate email';
    expect(await request('/api/auth/signup', { method: 'POST', json: {
      email, password, username: 'pce_duplicate', displayName: 'Duplicate',
    } }), 409, 'ACCOUNT_ALREADY_EXISTS');
    console.log('[PCE HTTP] PASS duplicate email refused');

    phase = 'incorrect password';
    await login(state.email);
    const badPassword = expect(await request('/api/auth/login', {
      method: 'POST', json: { email, password: 'deliberately-wrong-password' },
    }), 401);
    assert.equal(badPassword.error, 'invalid credentials');
    console.log('[PCE HTTP] PASS incorrect password refused');

    phase = 'missing JWT';
    await verify(token, state);
    assert.equal(expect(await request('/api/users/me'), 401).error, 'unauthorized');
    console.log('[PCE HTTP] PASS missing JWT refused');

    phase = 'username conflict';
    const secondEmail = 'pce_second@example.invalid';
    const signup = await request('/api/auth/signup', { method: 'POST', json: {
      email: secondEmail, password, username: 'pce_second', displayName: 'PCE second',
    } });
    assert.ok([201, 202].includes(signup.status), 'Second signup failed');
    if (signup.status === 202) expect(signup, 202, 'REGISTRATION_PENDING');
    const secondToken = await login(secondEmail);
    const secondBefore = expect(await request('/api/users/me', { token: secondToken }), 200);
    expect(await request('/api/users/me/profile', { method: 'PUT', token: secondToken,
      json: { ...values, displayName: 'Must not persist' } }), 409);
    assert.deepEqual(expect(await request('/api/users/me', { token: secondToken }), 200), secondBefore);
    await verify(token, state);
    console.log('[PCE HTTP] PASS username conflict, both profiles unchanged');

    phase = 'forbidden avatar MIME';
    await verify(token, state);
    assert.equal(expect(await request('/api/users/me/avatar', {
      method: 'POST', token, ...multipart(Buffer.from('forbidden text'), 'text/plain'),
    }), 415).error, 'unsupported avatar mime type');
    await verify(await login(state.email), state);
    console.log('[PCE HTTP] PASS forbidden avatar, valid image and profile retained');
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
