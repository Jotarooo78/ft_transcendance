import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";
import { parseTrackQuery, toTrackDto } from "./catalog.js";

const id = "20000000-0000-4000-8000-000000000001";
const row = { id, title: "Aube", artistName: "Atelier Demo", albumTitle: "", genre: "Demo",
  durationMs: 6000n, audioAssetId: "30000000-0000-4000-8000-000000000001" };

test("asset publication reveals only a boolean and distinguishes outages", async t => {
  let failed = false;
  const app = buildApp({ ready: async () => {}, readTrack: async () => null,
    isAssetPublished: async value => { if (failed) throw new Error("SQL"); return value === row.audioAssetId; } });
  t.after(() => app.close());
  assert.equal((await app.inject('/assets/no/publication')).statusCode, 400);
  assert.deepEqual((await app.inject(`/assets/${row.audioAssetId}/publication`)).json(), { published: true });
  assert.deepEqual((await app.inject(`/assets/${id}/publication`)).json(), { published: false });
  failed = true;
  assert.equal((await app.inject(`/assets/${id}/publication`)).statusCode, 503);
});

test("list bounds and malformed parameters reject before reading", async t => {
  let calls = 0;
  const app = buildApp({ ready: async () => {}, readTrack: async () => null,
    listTracks: async query => { calls++; return { ...query, items: [], total: 0, genres: [] }; } });
  t.after(() => app.close());
  for (const bad of ["page=0", "page=-1", "page=1.5", "page=1e2", "pageSize=101", "pageSize=0", "page=9007199254740992",
    "page=9007199254740991&pageSize=100", "sort=no", "page=1&page=2", "genre=a&genre=b", "q=a&q=b", "unknown=x", `q=${"a".repeat(201)}`]) {
    assert.equal((await app.inject(`/tracks?${bad}`)).statusCode, 400, bad);
  }
  assert.equal(calls, 0);
  const result = await app.inject("/tracks?page=2&pageSize=2&q=none&sort=artist");
  assert.equal(result.statusCode, 200); assert.equal(result.json().total, 0);
  assert.equal(result.json().page, 2); assert.deepEqual(result.json().items, []);
  assert.deepEqual(parseTrackQuery({}), { page: 1, pageSize: 20, q: "", genre: "", sort: "title" });
});

test("list storage failure is a controlled 503", async t => {
  const app = buildApp({ ready: async () => {}, readTrack: async () => null,
    listTracks: async () => { throw new Error("private SQL"); } });
  t.after(() => app.close());
  const r = await app.inject("/tracks");
  assert.equal(r.statusCode, 503); assert.deepEqual(r.json(), { error: "catalog_unavailable" });
});

test("detail DTO has explicit units and exposes only public fields", () => {
  const dto = toTrackDto({ ...row });
  assert.equal(dto.durationSeconds, 6);
  assert.equal(dto.audioUrl, `/api/media/assets/${row.audioAssetId}/audio`);
  assert.deepEqual(Object.keys(dto).sort(), ["id", "title", "artistName", "albumTitle", "genre", "durationMs", "durationSeconds", "audioAssetId", "audioUrl"].sort());
  assert.doesNotThrow(() => JSON.stringify(dto));
  assert.throws(() => toTrackDto({ ...row, durationMs: 9007199254740993n }));
  assert.throws(() => toTrackDto({ ...row, durationMs: 0n }));
  assert.equal(toTrackDto({ ...row, durationMs: null, audioAssetId: null }).audioUrl, null);
});

test("detail validation, missing/invisible track, outage and readiness", async t => {
  let calls = 0;
  let unavailable = false;
  let closed = false;
  const app = buildApp({
    ready: async () => { if (unavailable) throw new Error("private db detail"); },
    close: async () => { closed = true; },
    readTrack: async value => {
      calls++;
      if (unavailable) throw new Error("private db detail");
      return value === id ? toTrackDto(row) : null;
    },
  });
  t.after(() => app.close());
  assert.equal((await app.inject(`/tracks/not-uuid`)).statusCode, 400);
  assert.equal(calls, 0);
  const valid = await app.inject(`/tracks/${id}`);
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(valid.json(), toTrackDto(row));
  for (const suffix of ["098", "099"]) {
    const r = await app.inject(`/tracks/20000000-0000-4000-8000-000000000${suffix}`);
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().error, "track_not_found");
  }
  assert.equal((await app.inject("/ready")).statusCode, 200);
  assert.match((await app.inject("/metrics")).body, /catalog_service_/);
  unavailable = true;
  const failure = await app.inject(`/tracks/${id}`);
  assert.equal(failure.statusCode, 503);
  assert.deepEqual(failure.json(), { error: "catalog_unavailable" });
  assert.equal((await app.inject("/ready")).statusCode, 503);
  assert.equal((await app.inject("/health")).statusCode, 200);
  await app.close();
  assert.equal(closed, true);
});
