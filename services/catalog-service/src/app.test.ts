import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "./app.js";
import { toTrackDto } from "./catalog.js";

const id = "20000000-0000-4000-8000-000000000001";
const row = { id, title: "Aube", artistName: "Atelier Demo", albumTitle: "", genre: "Demo",
  durationMs: 6000n, audioAssetId: "30000000-0000-4000-8000-000000000001" };

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
