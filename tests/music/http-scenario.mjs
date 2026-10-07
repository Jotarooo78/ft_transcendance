import assert from 'node:assert/strict';
import https from 'node:https';
import { createHash, createHmac } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export const base = new URL(process.env.MUSIC_BASE_URL ?? 'https://127.0.0.1:3443');
assert.equal(base.protocol, 'https:');
assert.equal(base.hostname, '127.0.0.1');
assert.equal(base.port, '3443');
assert.equal(base.pathname, '/');
assert.ok(!base.username && !base.password && !base.search && !base.hash);

export function request(path, { method = 'GET', headers = {}, body } = {}) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(path, base), { method, headers, rejectUnauthorized: false, timeout: 10_000 }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 8 * 1024 * 1024) res.destroy(new Error('Response too large')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => { const bytes = Buffer.concat(chunks); resolve({ status: res.statusCode, headers: res.headers, bytes,
        json: () => JSON.parse(bytes.toString('utf8')) }); });
    });
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

export async function waitReady(service) {
  for (let n = 0; n < 60; n++) {
    try { if ((await request(`/api/${service}/ready`)).status === 200) return; } catch { /* bounded recovery */ }
    await delay(1000);
  }
  throw new Error(`${service} did not become ready`);
}

const trackIds = [1, 2, 3].map(n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
async function catalog() {
  await waitReady('catalog');
  const list = async query => {
    const response = await request(`/api/catalog/tracks${query}`);
    assert.equal(response.status, 200, `list ${query}`);
    return response.json();
  };
  const all = await list('');
  assert.equal(all.total, 3); assert.deepEqual(all.genres, ['Demo']);
  assert.deepEqual(all.items.map(t => t.id), trackIds);
  assert.deepEqual(all.items.map(t => t.title), ['Aube — demo', 'Brise — demo', 'Clair — demo']);
  for (const track of all.items) {
    const detail = await request(`/api/catalog/tracks/${track.id}`);
    assert.equal(detail.status, 200); assert.deepEqual(detail.json(), track);
    assert.equal(track.durationMs, 6000); assert.equal(track.durationSeconds, 6);
    assert.equal(track.artistName, 'Atelier Demo'); assert.equal(track.albumTitle, '');
    assert.equal(track.audioUrl, `/api/media/assets/${track.audioAssetId}/audio`);
    assert.deepEqual(Object.keys(track).sort(), ['id','title','artistName','albumTitle','genre','durationMs','durationSeconds','audioAssetId','audioUrl'].sort());
  }
  for (const sort of ['title', 'artist', 'duration']) {
    const pages = await Promise.all([1, 2].map(page => list(`?pageSize=2&page=${page}&sort=${sort}`)));
    assert.deepEqual(pages.map(p => p.total), [3, 3]);
    assert.deepEqual(pages.flatMap(p => p.items.map(t => t.id)), trackIds);
    // Artist and duration ties are resolved across pages by UUID.
    assert.deepEqual((await list(`?pageSize=1&page=2&sort=${sort}`)).items.map(t => t.id), [trackIds[1]]);
  }
  assert.deepEqual((await list('?page=4')).items, []);
  assert.equal((await list('?page=4')).total, 3);
  assert.equal((await list('?q=aUbE')).total, 1);
  assert.equal((await list('?q=Atelier')).total, 3);
  assert.equal((await list('?genre=Demo')).total, 3);
  assert.equal((await list('?genre=absent')).total, 0);
  for (const q of ['introuvable', '%', '_', "' OR true --", 'Brouillon']) {
    assert.equal((await list(`?q=${encodeURIComponent(q)}`)).total, 0);
  }
  for (const query of ['page=0','page=-1','page=1.5','pageSize=101','pageSize=0','sort=unknown','page=1&page=2',`q=${'x'.repeat(201)}`]) {
    assert.equal((await request(`/api/catalog/tracks?${query}`)).status, 400, query);
  }
  for (const suffix of ['098','099']) assert.equal((await request(`/api/catalog/tracks/20000000-0000-4000-8000-000000000${suffix}`)).status, 404);
  assert.equal((await request('/api/catalog/tracks/invalid')).status, 400);
  assert.equal((await request('/api/catalog/metrics')).status, 403);
}

async function catalogEdge() {
  await waitReady('catalog');
  const list = async query => { const r = await request(`/api/catalog/tracks?${query}`); assert.equal(r.status, 200); return r.json(); };
  const edge1 = '21000000-0000-4000-8000-000000000001', edge2 = '21000000-0000-4000-8000-000000000002';
  assert.equal((await list('')).total, 5);
  assert.deepEqual((await list('sort=title&pageSize=2')).items.map(t => t.id), [trackIds[0], edge1]);
  assert.deepEqual((await list('sort=duration&pageSize=2')).items.map(t => t.id), [edge2, trackIds[0]]);
  assert.deepEqual((await list('sort=artist&pageSize=2&page=3')).items.map(t => t.id), [edge1]);
  assert.deepEqual((await list('q=%25_')).items.map(t => t.id), [edge2]);
  assert.deepEqual((await list('genre=Other')).items.map(t => t.id), [edge1, edge2]);
}

const hashes = [
  '5677a050f387c21a475ab48574c58b694f895a4a892e6856e25ef89e8e4d6acb',
  '2555a613adb120e97254d51e67841193f7481d5058450ef9e77b86d6088b5323',
  'fd61a1cf5debdd360c057b20aaf36618ba6cced33536326ddf540e69bef0a882',
];
async function media(edge = false) {
  await waitReady('media'); await waitReady('catalog');
  for (let index = 0; index < 3; index++) {
    const path = `/api/media/assets/30000000-0000-4000-8000-00000000000${index + 1}/audio`;
    const full = await request(path);
    assert.equal(full.status, 200); assert.equal(full.bytes.length, 96044);
    assert.equal(full.headers['content-type'], 'audio/wav');
    assert.equal(full.headers['content-length'], '96044');
    assert.equal(full.headers['cache-control'], 'no-store');
    assert.equal(full.headers['accept-ranges'], 'bytes');
    assert.equal(createHash('sha256').update(full.bytes).digest('hex'), hashes[index]);
    assert.equal(full.bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(full.bytes.toString('ascii', 8, 16), 'WAVEfmt ');
    assert.equal(full.bytes.readUInt32LE(24), 8000); assert.equal(full.bytes.readUInt16LE(34), 16);
    for (const [range, start, end] of [['bytes=0-43',0,43],['bytes=96043-',96043,96043],['bytes=-9',96035,96043],['bytes=20-999999',20,96043],['bytes=-999999',0,96043]]) {
      const r = await request(path, {headers:{Range:range}});
      assert.equal(r.status,206); assert.deepEqual(r.bytes,full.bytes.subarray(start,end+1));
      assert.equal(r.headers['content-range'],`bytes ${start}-${end}/96044`);
      assert.equal(r.headers['content-length'],String(end-start+1));
    }
    for (const range of ['bytes=96044-','bytes=3-2','bytes=0-1,4-5','bytes=-0','bytes=9007199254740992-']) {
      const r=await request(path,{headers:{Range:range}});
      assert.equal(r.status,416); assert.equal(r.headers['content-range'],'bytes */96044');
    }
    const head=await request(path,{method:'HEAD',headers:{Range:'bytes=0-43'}});
    assert.equal(head.status,200); assert.equal(head.bytes.length,0);
    assert.equal(head.headers['content-length'],'96044'); assert.equal(head.headers['content-type'],'audio/wav');
  }
  assert.equal((await request('/api/media/assets/no/audio')).status,400);
  assert.equal((await request('/api/media/assets/30000000-0000-4000-8000-000000000099/audio')).status,404);
  assert.equal((await request('/api/media/metrics')).status,403);
  if (edge) for(const suffix of ['001','002','003']) for(const method of ['GET','HEAD']) {
    const r=await request(`/api/media/assets/32000000-0000-4000-8000-000000000${suffix}/audio`,{method});
    assert.equal(r.status,404,`edge ${suffix} ${method}`);
    if(method==='HEAD') assert.equal(r.bytes.length,0);
    else assert.deepEqual(r.json(),{error:'media_not_found'});
  }
}

const libraryStatePath = '/tmp/transcendence-music-library-state.json';
const testPassword = 'MusicTestOnly_123!';
async function jsonRequest(path, method, body, token) {
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  return request(path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(encoded === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded) }) }, body: encoded });
}
async function loginFixture(user) {
  const response = await jsonRequest('/api/auth/login', 'POST', { email: user.email, password: testPassword });
  assert.equal(response.status, 200, 'fixture login');
  const token = response.json().token; assert.equal(typeof token, 'string'); return token;
}
async function createFixtureUser(suffix) {
  const username = `lib_${Date.now().toString(36)}_${suffix}`;
  const email = `${username}@example.test`;
  const response = await jsonRequest('/api/auth/signup', 'POST', { username, email, displayName: 'Library HTTP', password: testPassword });
  assert.equal(response.status, 201, 'fixture signup');
  return { username, email, id: response.json().userId };
}
async function libraryCall(token, suffix, method = 'GET', body, status = 200) {
  const response = await jsonRequest(`/api/library/playlists${suffix}`, method, body, token);
  assert.equal(response.status, status, `Library ${method} ${suffix}`);
  assert.equal(response.headers['cache-control'], 'no-store');
  return status === 204 ? undefined : response.json();
}
function signedTestToken(claims) {
  const payload = [ { alg: 'HS256', typ: 'JWT' }, claims ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return payload + '.' + createHmac('sha256', 'e2e_test_only_jwt_secret_with_sufficient_length').update(payload).digest('base64url');
}
async function library() {
  await waitReady('library');
  const a = await createFixtureUser('a'), b = await createFixtureUser('b');
  const ta = await loginFixture(a), tb = await loginFixture(b);
  let p = await libraryCall(ta, '', 'POST', { name: '  HTTP library A  ' }, 201);
  assert.equal(p.name, 'HTTP library A'); assert.equal(p.description, ''); assert.equal(p.version, 1); assert.deepEqual(p.items, []);
  const sameA = async () => assert.deepEqual(await libraryCall(ta, `/${p.id}`), p);
  for (const body of [{ name: '' }, { name: ' '.repeat(3) }, { name: 'x'.repeat(101) }, { name: 'ok', description: 'x'.repeat(2001) },
    { name: 'ok', ownerUserId: a.id }, { name: 'ok', visibility: 'public' }, { name: 'ok', version: 99 }, { name: 123 }]) {
    await libraryCall(ta, '', 'POST', body, 400); await sameA();
  }
  const boundary = await libraryCall(ta, '', 'POST', { name: '🎵'.repeat(100), description: 'd'.repeat(2000) }, 201);
  await libraryCall(ta, `/${boundary.id}`, 'DELETE', { expectedVersion: 1 }, 204);
  const missing = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  for (const trackId of [missing, '20000000-0000-4000-8000-000000000099']) {
    await libraryCall(ta, `/${p.id}/items`, 'POST', { trackId, expectedVersion: p.version }, 404); await sameA();
  }
  for (const body of [{ trackId: trackIds[0], expectedVersion: 0 }, { trackId: 'bad', expectedVersion: 1 },
    { trackId: trackIds[0], expectedVersion: 1, ownerUserId: b.id }]) {
    await libraryCall(ta, `/${p.id}/items`, 'POST', body, 400); await sameA();
  }
  p = await libraryCall(ta, `/${p.id}/items`, 'POST', { trackId: trackIds[0], expectedVersion: 1 });
  p = await libraryCall(ta, `/${p.id}/items`, 'POST', { trackId: trackIds[0], expectedVersion: 2 });
  assert.equal(p.version, 3); assert.equal(p.items.length, 2); assert.notEqual(p.items[0].id, p.items[1].id);
  assert.deepEqual(p.items.map(item => item.position), [1, 2]);
  const initial = structuredClone(p), removed = p.items[0].id;
  const routes = [ ['', 'GET', undefined], ['', 'POST', { name: 'unauthorized' }], [`/${p.id}`, 'GET', undefined],
    [`/${p.id}/items`, 'POST', { trackId: trackIds[0], expectedVersion: 3 }],
    [`/${p.id}/items/${removed}`, 'DELETE', { expectedVersion: 3 }],
    [`/${p.id}`, 'PATCH', { name: 'forbidden', expectedVersion: 3 }], [`/${p.id}`, 'DELETE', { expectedVersion: 3 }] ];
  for (const token of [undefined, 'invalid.jwt.token', signedTestToken({ sub: a.id, exp: 1 }),
    signedTestToken({ sub: 'not-a-uuid', exp: Math.floor(Date.now()/1000)+60 })]) {
    for (const [path, method, body] of routes) { await libraryCall(token, path, method, body, 401); await sameA(); }
  }
  assert.deepEqual((await libraryCall(tb, '')).items, []);
  for (const [path, method, body] of routes.slice(2)) { await libraryCall(tb, path, method, body, 404); await sameA(); }
  await libraryCall(tb, '', 'POST', { name: 'forged', ownerUserId: a.id }, 400); await sameA();
  let pb = await libraryCall(tb, '', 'POST', { name: 'HTTP library B' }, 201);
  pb = await libraryCall(tb, `/${pb.id}/items`, 'POST', { trackId: trackIds[1], expectedVersion: 1 });
  await libraryCall(ta, `/${p.id}/items/${pb.items[0].id}`, 'DELETE', { expectedVersion: 3 }, 404); await sameA();
  p = await libraryCall(ta, `/${p.id}/items/${removed}`, 'DELETE', { expectedVersion: 3 });
  assert.deepEqual(p.items, [initial.items[1]]); assert.equal(p.version, 4);
  await libraryCall(ta, `/${p.id}/items/${removed}`, 'DELETE', { expectedVersion: 3 }, 409); await sameA();
  await libraryCall(ta, `/${p.id}/items/${removed}`, 'DELETE', { expectedVersion: 4 }, 404); await sameA();
  // Real simultaneous requests exercise PostgreSQL row locks, not injected writers.
  const concurrent = await Promise.all([0, 1].map(() => jsonRequest(`/api/library/playlists/${p.id}/items`, 'POST',
    { trackId: trackIds[0], expectedVersion: 4 }, ta)));
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  p = await libraryCall(ta, `/${p.id}`); assert.equal(p.version, 5);
  assert.deepEqual(p.items.map(item => item.position), [2, 3]); assert.equal(new Set(p.items.map(item => item.id)).size, 2);
  for (const body of [{ name: '', description: 'must not write', expectedVersion: 5 }, { description: 'x'.repeat(2001), expectedVersion: 5 },
    { ownerUserId: b.id, expectedVersion: 5 }, { visibility: 'public', expectedVersion: 5 }]) {
    await libraryCall(ta, `/${p.id}`, 'PATCH', body, 400); await sameA();
  }
  await libraryCall(ta, `/${p.id}`, 'PATCH', { name: 'stale', expectedVersion: 4 }, 409); await sameA();
  await libraryCall(ta, `/${p.id}`, 'DELETE', { expectedVersion: 4 }, 409); await sameA();
  p = await libraryCall(ta, `/${p.id}`, 'PATCH', { name: '  Persisted A  ', description: '  preserved  ', expectedVersion: 5 });
  assert.equal(p.version, 6); assert.equal(p.name, 'Persisted A'); assert.equal(p.description, 'preserved');
  let deleted = await libraryCall(ta, '', 'POST', { name: 'Cascade fixture' }, 201);
  deleted = await libraryCall(ta, `/${deleted.id}/items`, 'POST', { trackId: trackIds[2], expectedVersion: 1 });
  await libraryCall(ta, `/${deleted.id}`, 'DELETE', { expectedVersion: 2 }, 204);
  await libraryCall(ta, `/${deleted.id}`, 'DELETE', { expectedVersion: 2 }, 404);
  await libraryCall(ta, `/${deleted.id}`, 'GET', undefined, 404);
  for (const query of ['?page=0', '?pageSize=101', '?page=1.2', '?ownerUserId='+b.id]) await libraryCall(ta, query, 'GET', undefined, 400);
  await libraryCall(ta, '/bad', 'GET', undefined, 400);
  await sameA(); assert.deepEqual((await libraryCall(ta, '?page=1&pageSize=1')).items, [p]);
  assert.deepEqual((await libraryCall(ta, '?page=2&pageSize=1')).items, []);
  assert.equal((await request('/api/library/metrics')).status, 403);
  await writeFile(libraryStatePath, JSON.stringify({ a, b, p, pb, removed, deleted, boundaryId: boundary.id }), { mode: 0o600 });
}
async function libraryVerify(mode) {
  await waitReady('library');
  const state = JSON.parse(await readFile(libraryStatePath, 'utf8'));
  const { a, b, p, pb } = state, ta = await loginFixture(a), tb = await loginFixture(b);
  assert.deepEqual(await libraryCall(ta, `/${p.id}`), p);
  assert.deepEqual(await libraryCall(tb, `/${pb.id}`), pb);
  for (const [token, expected] of [[ta, p], [tb, pb]]) {
    const list = await libraryCall(token, ''); assert.equal(list.total, 1); assert.deepEqual(list.items, [expected]);
  }
  await libraryCall(tb, `/${p.id}`, 'GET', undefined, 404);
  await libraryCall(ta, `/${state.deleted.id}`, 'GET', undefined, 404);
  if (mode === 'library-unavailable') {
    await libraryCall(ta, `/${p.id}/items`, 'POST', { trackId: trackIds[0], expectedVersion: p.version }, 503);
    assert.deepEqual(await libraryCall(ta, `/${p.id}`), p);
    // Creation, edit and deletion remain local while Catalogue is stopped.
    const temp = await libraryCall(ta, '', 'POST', { name: 'No catalogue required' }, 201);
    await libraryCall(ta, `/${temp.id}`, 'PATCH', { description: 'local', expectedVersion: 1 });
    await libraryCall(ta, `/${temp.id}`, 'DELETE', { expectedVersion: 2 }, 204);
  } else {
    assert.equal((await request(`/api/catalog/tracks/${trackIds[2]}`)).status, 200);
    assert.equal((await request('/api/media/assets/30000000-0000-4000-8000-000000000003/audio', { method: 'HEAD' })).status, 200);
  }
  if (mode === 'library-cleanup') {
    await libraryCall(ta, `/${p.id}`, 'DELETE', { expectedVersion: p.version }, 204);
    await libraryCall(tb, `/${pb.id}`, 'DELETE', { expectedVersion: pb.version }, 204);
    await libraryCall(ta, `/${p.id}`, 'GET', undefined, 404); await libraryCall(tb, `/${pb.id}`, 'GET', undefined, 404);
  }
}

const mode = process.argv[2];
if (mode === 'catalog' || mode === 'catalog-verify') await catalog();
else if (mode === 'catalog-edge') await catalogEdge();
else if (mode === 'media' || mode === 'media-verify') await media(mode === 'media');
else if (mode === 'library') await library();
else if (['library-verify', 'library-unavailable', 'library-cleanup'].includes(mode)) await libraryVerify(mode);
else if (mode === 'media-unavailable') {
  const r=await request('/api/media/assets/30000000-0000-4000-8000-000000000001/audio');
  assert.equal(r.status,503); assert.deepEqual(r.json(),{error:'media_unavailable'});
}
else throw new Error('Unknown music scenario');
console.log(`PASS ${mode}: HTTPS assertions, no fixture reinstallation`);
