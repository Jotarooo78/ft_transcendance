import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { buildApp } from "./app.js";
import { catalogReader } from "./catalog.js";
import { toSession } from "./session.js";

const owner = "40000000-0000-4000-8000-000000000001", trackId = "20000000-0000-4000-8000-000000000001";
const id = "70000000-0000-4000-8000-000000000001";
const row = { id, trackId, trackDurationMs: 6000n, startedAt: new Date("2026-01-01T00:00:00Z"), endedAt: null, listenedMs: 0n, lastSequence: 0 };

test("opening uses verified identity and catalogue duration; refusals write nothing", async t => {
  let writes = 0, lookups = 0, duration: number | null = 6000, outage = false, closed = false;
  const app = buildApp({ jwtSecret: "test-only-playback-secret", ready: async () => { if (outage) throw new Error("DB down"); },
    close: async () => { closed = true; },
    readTrackDuration: async id => { lookups++; assert.equal(id, trackId); if (outage) throw new Error("Catalogue down"); return duration; },
    createSession: async (subject, track, ms) => { assert.equal(subject, owner); assert.equal(track, trackId); assert.equal(ms, 6000); writes++; return toSession(row); },
  });
  t.after(() => app.close()); await app.ready();
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: owner })}` };
  for (const token of [undefined, "invalid", app.jwt.sign({ sub: "bad" }), app.jwt.sign({ sub: owner, exp: 1 })]) {
    assert.equal((await app.inject({ method: "POST", url: "/sessions", payload: { trackId }, headers: token ? { authorization: `Bearer ${token}` } : {} })).statusCode, 401);
  }
  for (const payload of [{}, { trackId: "bad" }, { trackId, userId: owner }, { trackId, trackDurationMs: 1 }, { trackId, startedAt: "now" }]) {
    assert.equal((await app.inject({ method: "POST", url: "/sessions", headers, payload })).statusCode, 400);
  }
  assert.equal(lookups, 0); assert.equal(writes, 0);
  duration = null; assert.equal((await app.inject({ method: "POST", url: "/sessions", headers, payload: { trackId } })).statusCode, 404);
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    duration = value; assert.equal((await app.inject({ method: "POST", url: "/sessions", headers, payload: { trackId } })).statusCode, 503);
  }
  outage = true; assert.equal((await app.inject({ method: "POST", url: "/sessions", headers, payload: { trackId } })).statusCode, 503);
  assert.equal((await app.inject({ url: "/ready" })).statusCode, 503); assert.equal((await app.inject({ url: "/health" })).statusCode, 200);
  assert.equal(writes, 0); outage = false; duration = 6000;
  const created = await app.inject({ method: "POST", url: "/sessions", headers, payload: { trackId } });
  assert.equal(created.statusCode, 201); assert.equal(created.headers["cache-control"], "no-store"); assert.deepEqual(created.json(), toSession(row));
  assert.equal(writes, 1); assert.equal(created.json().qualified, undefined); assert.equal(created.json().listenedMs, 0);
  assert.equal((await app.inject({ url: "/metrics" })).statusCode, 200);
  await app.close(); assert.equal(closed, true);
  assert.throws(() => toSession({ ...row, trackDurationMs: BigInt(Number.MAX_SAFE_INTEGER) + 1n }));
});

test("Catalogue client bounds time and validates duration and identity", async t => {
  let status = 200, payload: unknown = { id: trackId, durationMs: 6000 }, hold = false;
  const server = createServer((_req, res) => { if (hold) return; res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(payload)); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const read = catalogReader(`http://127.0.0.1:${address.port}`, 100);
  assert.equal(await read(trackId), 6000); status = 404; assert.equal(await read(trackId), null);
  status = 503; await assert.rejects(read(trackId)); status = 200;
  for (const value of [{ id: owner, durationMs: 6000 }, { id: trackId, durationMs: null }, { id: trackId, durationMs: 0 }, { id: trackId, durationMs: "6000" }]) {
    payload = value; await assert.rejects(read(trackId));
  }
  hold = true; await assert.rejects(read(trackId));
});
