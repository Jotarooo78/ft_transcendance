import assert from 'node:assert/strict';
import https from 'node:https';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createFixtures } from './fixtures/create-fixtures.mjs';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const base = new URL(process.env.FILES_BASE_URL ?? 'https://127.0.0.1:1443');
assert.equal(base.href, 'https://127.0.0.1:1443/');
const password = 'Files-test-only-password-2026';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const uuid = value => { assert.match(value, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i); return value; };

export function compose(args, input, maximum = 4 * 1024 * 1024) {
  const override = process.env.FILES_COMPOSE_OVERRIDE;
  if (override) assert.ok(override.startsWith('/tmp/transcendence-files-') && override.endsWith('.yml'));
  return execFileSync('docker', ['compose', '-p', 'common_repo', '-f', `${root}docker-compose.yml`, ...(override ? ['-f', override] : []), ...args],
    { cwd: root, input, maxBuffer: maximum, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
export function sql(query, variables = {}) {
  const argumentsList = Object.entries(variables).flatMap(([key, value]) => ['-v', `${key}=${value}`]);
  const guarded = `DO $$ BEGIN IF current_database() <> 'transcendence' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;\n${query}`;
  return compose(['exec', '-T', 'db', 'sh', '-c', 'exec psql -X -q -A -t -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 "$@"', 'psql', ...argumentsList], guarded);
}
export function request(path, { method = 'GET', token, json, bytes, contentType } = {}) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  const body = json === undefined ? bytes : Buffer.from(JSON.stringify(json));
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, base), { method, rejectUnauthorized: false, headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': contentType ?? 'application/json', 'content-length': body.length } : {}) } }, response => {
      const chunks = []; let length = 0;
      response.on('data', chunk => { length += chunk.length; if (length > 8 * 1024 * 1024) response.destroy(new Error('Response limit exceeded')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => { const payload = Buffer.concat(chunks); resolve({ status: response.statusCode, headers: response.headers, bytes: payload,
        data: String(response.headers['content-type']).includes('application/json') && payload.length ? JSON.parse(payload.toString()) : null }); });
    });
    req.setTimeout(330_000, () => req.destroy(new Error('File HTTP timeout'))); req.on('error', reject); req.end(body);
  });
}
export function expect(response, status) { assert.equal(response.status, status, `Expected HTTP ${status}, got ${response.status}`); return response.data; }
export async function waitReady() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { const responses = await Promise.all(['auth','users','catalog','media','library','playback'].map(service => request(`/api/${service}/ready`))); if (responses.every(response => response.status === 200)) return; } catch { /* bounded startup */ }
    await delay(1000);
  }
  throw new Error('File services did not become ready');
}
export async function login(account) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await request('/api/auth/login', { method: 'POST', json: { email: account.email, password } });
    if (response.status === 202) { await delay(1000); continue; }
    const data = expect(response, 200); assert.equal(typeof data.token, 'string'); return data.token;
  }
  throw new Error('Registration remained pending');
}
export async function createAccount(campaign, suffix) {
  const username = `files_${campaign}_${suffix}`; const email = `${username}@example.invalid`;
  const result = await request('/api/auth/signup', { method: 'POST', json: { username, email, password, displayName: `Files ${suffix}` } });
  assert.ok([201,202].includes(result.status), `Signup failed with ${result.status}`);
  const account = { username, email }; const token = await login(account);
  const profile = expect(await request('/api/users/me', { token }), 200);
  return { ...account, id: uuid(profile.userId) };
}
export function multipart(bytes, mime) {
  const boundary = `files-${randomUUID()}`;
  return { contentType: `multipart/form-data; boundary=${boundary}`, bytes: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="../../untrusted"\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`) ]) };
}
export async function upload(token, bytes, mime) {
  const file = expect(await request('/api/media/assets', { method: 'POST', token, ...multipart(bytes, mime) }), 201);
  uuid(file.id); assert.equal(file.state, 'ready'); assert.deepEqual(Object.keys(file).sort(), ['id','usage','state','mimeType','byteSize','durationMs'].sort());
  return file;
}
export async function oversizedAudio(token) {
  const prefix = Buffer.from('--large\r\nContent-Disposition: form-data; name="file"; filename="large.wav"\r\nContent-Type: audio/wav\r\n\r\n');
  const suffix = Buffer.from('\r\n--large--\r\n'); const maximumPlusOne = 500_000_001; const chunk = Buffer.alloc(1024 * 1024);
  const controller = new AbortController(); let status;
  const response = new Promise((resolve, reject) => {
    const req = https.request(new URL('/api/media/assets', base), { method: 'POST', rejectUnauthorized: false, headers: {
      authorization: `Bearer ${token}`, 'content-type': 'multipart/form-data; boundary=large', 'content-length': prefix.length + maximumPlusOne + suffix.length } }, res => {
      status = res.statusCode; res.resume(); res.on('end', () => { resolve(status); controller.abort(); }); res.on('error', reject);
    });
    req.on('error', error => { if (status === undefined) reject(error); });
    req.setTimeout(60_000, () => req.destroy(new Error('Oversized audio timeout')));
    const source = Readable.from((function* () { yield prefix; for (let left = maximumPlusOne; left > 0; left -= Math.min(left,chunk.length)) yield chunk.subarray(0,Math.min(left,chunk.length)); yield suffix; })());
    void pipeline(source, req, { signal: controller.signal }).catch(error => { if (status === undefined) reject(error); });
  });
  assert.equal(await response, 413, '500,000,001 real file bytes must be refused through HTTPS');
}
export async function readState(path) { assert.equal((await stat(path)).mode & 0o777, 0o600); return JSON.parse(await readFile(path, 'utf8')); }
export async function writeState(path, state, initial = false) { await writeFile(path, JSON.stringify(state, null, 2), { mode: 0o600, ...(initial ? { flag: 'wx' } : {}) }); }

async function recordFile(token, account, bytes, mime) {
  const file = await upload(token, bytes, mime);
  const preview = await request(`/api/media/assets/${file.id}/private-content`, { token }); expect(preview, 200);
  return { ...file, ownerId: account.id, checksum: sha256(bytes), previewChecksum: sha256(preview.bytes), previewBytes: preview.bytes.length };
}
async function verifyStored(file, token, state = 'ready') {
  uuid(file.id); uuid(file.ownerId);
  const assertions = await readFile(new URL('./assert-files.sql', import.meta.url), 'utf8');
  assert.match(sql(assertions, { asset_id: file.id, owner_id: file.ownerId, purpose: file.usage === 'audio' ? 'audio' : 'cover', state,
    bytes: file.byteSize, checksum: file.checksum, duration: file.durationMs ?? 0 }), /FILE_SQL_PASS/);
  if (state === 'deleted') {
    const result = compose(['exec', '-T', 'media-service', 'node', '--input-type=module', '-e',
      'import { lstat } from "node:fs/promises"; const id=process.argv[1]; for (const key of [id+".original",id+".preview.mp3"]) { try { await lstat("/data/audio/"+key); throw new Error("Deleted bytes remain"); } catch(e) { if(e.code!=="ENOENT") throw e; } } console.log("DISK_ABSENT_PASS");', file.id]);
    assert.match(result, /DISK_ABSENT_PASS/); expect(await request(`/api/media/assets/${file.id}/private-content`, { token }), 404); return;
  }
  const result = compose(['exec', '-T', 'media-service', 'node', '--input-type=module', '-e',
    'import { createReadStream } from "node:fs"; import { createHash } from "node:crypto"; const hash=createHash("sha256"); for await(const chunk of createReadStream("/data/audio/"+process.argv[1]+".original")) hash.update(chunk); console.log(hash.digest("hex"));', file.id]);
  assert.equal(result.trim(), file.checksum);
  const response = await request(`/api/media/assets/${file.id}/private-content`, { token }); expect(response, 200);
  assert.equal(sha256(response.bytes), file.previewChecksum); assert.equal(response.bytes.length, file.previewBytes);
  assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers['content-type'], file.usage === 'audio' ? 'audio/mpeg' : file.mimeType);
  assert.equal(Number(response.headers['content-length']), file.previewBytes);
  const head = await request(`/api/media/assets/${file.id}/private-content`, { method: 'HEAD', token }); expect(head, 200); assert.equal(head.bytes.length, 0);
}
async function verify(state) {
  await waitReady(); const tokenA = await login(state.a); const tokenB = await login(state.b);
  const aIds = expect(await request('/api/media/assets?pageSize=100', { token: tokenA }), 200).items.map(file => file.id);
  const bIds = expect(await request('/api/media/assets?pageSize=100', { token: tokenB }), 200).items.map(file => file.id);
  for (const file of state.files) {
    const isA = file.ownerId === state.a.id; assert.ok((isA ? aIds : bIds).includes(file.id)); assert.ok(!(isA ? bIds : aIds).includes(file.id));
    await verifyStored(file, isA ? tokenA : tokenB);
    expect(await request(`/api/media/assets/${file.id}/private-content`, { token: isA ? tokenB : tokenA }), 404);
    expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token: isA ? tokenB : tokenA }), 404);
    await verifyStored(file, isA ? tokenA : tokenB);
  }
}
async function references(state) {
  const token = await login(state.a); const [audio, cover, image] = state.files.filter(file => file.ownerId === state.a.id);
  const ids = { track: randomUUID(), release: randomUUID(), artist: randomUUID() };
  state.references = ids; await writeState(state.path, state);
  sql(`INSERT INTO catalog.tracks(id,title,audio_asset_id,duration_ms,status) VALUES ('${uuid(ids.track)}','Files reference fixture','${uuid(audio.id)}',6000,'draft');
    INSERT INTO catalog.releases(id,title,release_type,cover_asset_id,status) VALUES ('${uuid(ids.release)}','Files reference fixture','single','${uuid(cover.id)}','draft');
    INSERT INTO catalog.artists(id,name,slug,image_asset_id) VALUES ('${uuid(ids.artist)}','Files reference fixture','files-${uuid(ids.artist)}','${uuid(image.id)}');`);
  try {
    for (const file of [audio, cover, image]) { expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token }), 409); await verifyStored(file, token); }
    const existing = await request('/api/media/assets/30000000-0000-4000-8000-000000000001/audio'); expect(existing, 200); assert.equal(existing.bytes.length, 96044);
    sql(`DO $$ BEGIN IF (SELECT count(*) FROM catalog.tracks WHERE id='${ids.track}' AND audio_asset_id='${audio.id}' AND status='draft')<>1 OR
      (SELECT count(*) FROM catalog.releases WHERE id='${ids.release}' AND cover_asset_id='${cover.id}' AND status='draft')<>1 OR
      (SELECT count(*) FROM catalog.artists WHERE id='${ids.artist}' AND image_asset_id='${image.id}')<>1 THEN RAISE EXCEPTION 'Lost catalogue references'; END IF; END $$;`);
  } finally {
    sql(`DELETE FROM catalog.tracks WHERE id='${uuid(ids.track)}'; DELETE FROM catalog.releases WHERE id='${uuid(ids.release)}'; DELETE FROM catalog.artists WHERE id='${uuid(ids.artist)}';`);
    delete state.references; await writeState(state.path, state);
  }
}
export async function main(mode, statePath) {
  await waitReady();
  if (mode === 'initial') {
    try { await stat(statePath); throw new Error('State file exists; use a new campaign path'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const campaign = randomUUID().replaceAll('-', '').slice(0, 10); const fixtures = await createFixtures(`${statePath}.fixtures`);
    const state = { path: statePath, campaign, a: await createAccount(campaign, 'a'), b: await createAccount(campaign, 'b'), files: [] };
    await writeState(statePath, state, true);
    const tokenA = await login(state.a), tokenB = await login(state.b);
    for (const [token, account, bytes, mime] of [[tokenA,state.a,fixtures['audio.wav'],'audio/wav'], [tokenA,state.a,fixtures['image.png'],'image/png'],
      [tokenA,state.a,fixtures['image.png'],'image/png'], [tokenB,state.b,fixtures['image.png'],'image/png']]) {
      state.files.push(await recordFile(token, account, bytes, mime)); await writeState(statePath, state);
    }
    expect(await request('/api/media/assets'), 401);
    for (const [bytes, mime, status] of [[fixtures['audio.wav'],'image/png',415], [fixtures['truncated.wav'],'audio/wav',415],
      [fixtures['truncated.png'],'image/png',415], [fixtures['empty.wav'],'audio/wav',400], [fixtures['false.mp3'],'audio/mpeg',415], [fixtures['active.svg'],'image/svg+xml',415]]) {
      expect(await request('/api/media/assets', { method: 'POST', token: tokenA, ...multipart(bytes, mime) }), status);
    }
    const tooLarge = Buffer.alloc(25_000_001); fixtures['image.png'].copy(tooLarge);
    expect(await request('/api/media/assets', { method: 'POST', token: tokenA, ...multipart(tooLarge,'image/png') }), 413);
    await oversizedAudio(tokenA);
    expect(await request('/api/catalog/internal/assets/30000000-0000-4000-8000-000000000001/references'), 404);
    expect(await request('/api/media/assets/30000000-0000-4000-8000-000000000001', { method: 'DELETE', token: tokenA }), 404);
    await verify(state); await references(state);
    console.log('[FILES HTTP] PASS uploads, content refusals, owner isolation, SQL/disk, three reference protections and public audio');
  } else {
    const state = await readState(statePath); assert.equal(state.path, statePath);
    if (mode === 'verify') { await verify(state); console.log('[FILES HTTP] PASS persisted UUIDs, checksums, private bytes and owner isolation'); }
    else if (mode === 'catalog-down') {
      const token = await login(state.a); const file = state.files[0];
      compose(['stop', 'catalog-service']);
      try { expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token }), 503); await verifyStored(file, token); }
      finally { compose(['start', 'catalog-service']); }
      await waitReady(); console.log('[FILES HTTP] PASS catalogue outage refuses deletion and preserves bytes');
    } else if (mode === 'delete') {
      const tokenA = await login(state.a), tokenB = await login(state.b);
      for (const file of state.files.filter(file => file.ownerId === state.a.id)) {
        const responses = await Promise.all([1,2].map(() => request(`/api/media/assets/${file.id}`, { method: 'DELETE', token: tokenA })));
        responses.forEach(response => expect(response, 204)); await verifyStored(file, tokenA, 'deleted');
        expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token: tokenA }), 204);
      }
      for (const file of state.files.filter(file => file.ownerId === state.b.id)) await verifyStored(file, tokenB);
      for (const file of state.files.filter(file => file.ownerId === state.b.id)) { expect(await request(`/api/media/assets/${file.id}`, { method: 'DELETE', token: tokenB }), 204); await verifyStored(file, tokenB, 'deleted'); }
      expect(await request('/api/media/assets/30000000-0000-4000-8000-000000000001/audio'), 200);
      state.deleted = true; await writeState(statePath, state); console.log('[FILES HTTP] PASS concurrent/idempotent deletion, SQL/disk removal and preserved catalogue');
    } else throw new Error('Unknown file scenario mode');
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await main(process.argv[2] ?? 'initial', process.argv[3] ?? '/tmp/transcendence-files-state.json'); }
  catch (error) { console.error(`[FILES HTTP] FAIL ${error instanceof assert.AssertionError ? error.message : error?.code ?? error?.name ?? 'scenario'}`); process.exitCode = 1; }
}
