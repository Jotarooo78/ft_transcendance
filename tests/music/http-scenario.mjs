import assert from 'node:assert/strict';
import https from 'node:https';
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

const mode = process.argv[2];
if (mode === 'catalog' || mode === 'catalog-verify') await catalog();
else if (mode === 'catalog-edge') await catalogEdge();
else throw new Error('Expected catalog, catalog-verify or catalog-edge');
console.log(`PASS ${mode}: HTTPS assertions, no fixture reinstallation`);
