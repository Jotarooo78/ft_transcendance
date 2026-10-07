import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { buildApp } from "./app.js";
import { catalogReader } from "./catalog.js";
import { PlaybackError, progressInput, toSession, type SessionRow } from "./session.js";
import { recordProgress, type EventRow, type SessionTransaction } from "./progress.js";

const owner = "40000000-0000-4000-8000-000000000001", trackId = "20000000-0000-4000-8000-000000000001";
const id = "70000000-0000-4000-8000-000000000001";
const row = { id, trackId, trackDurationMs: 6000n, startedAt: new Date("2026-01-01T00:00:00Z"), endedAt: null, listenedMs: 0n, lastSequence: 0 };

function memoryTransaction(initial: SessionRow = row) {
  let state = structuredClone(initial), summaries = 0;
  const events = new Map<number, EventRow>();
  const tx: SessionTransaction = {
    get session() { return state; }, getEvent: async sequence => events.get(sequence) ?? null,
    createEvent: async event => { assert.equal(events.has(event.sequence), false); events.set(event.sequence, event); },
    saveProgress: async (listenedMs, lastSequence) => { summaries++; state = { ...state, listenedMs, lastSequence }; return state; },
  };
  return { tx, events, state: () => state, summaries: () => summaries };
}

test("exact retransmissions confirm one event even when older or closed; divergent content conflicts", async () => {
  const memory = memoryTransaction(), start = row.startedAt.getTime();
  const input = { sequence: 1, positionMs: 1000, listenedMsTotal: 1000 };
  const first = await recordProgress(memory.tx, input, () => start + 1000);
  // Pretend the first response was lost after both writes.
  assert.deepEqual(await recordProgress(memory.tx, input, () => start + 3000), first);
  assert.equal(memory.events.size, 1); assert.equal(memory.summaries(), 1);
  const second = await recordProgress(memory.tx, { sequence: 2, positionMs: 2000, listenedMsTotal: 2000 }, () => start + 2000);
  assert.deepEqual(await recordProgress(memory.tx, input), second);
  for (const divergent of [{ ...input, positionMs: 1001 }, { ...input, listenedMsTotal: 1001 }]) {
    await assert.rejects(recordProgress(memory.tx, divergent), PlaybackError);
  }
  assert.equal(memory.events.size, 2); assert.equal(memory.summaries(), 2); assert.equal(memory.state().listenedMs, 2000n);
  const closed = memoryTransaction({ ...memory.state(), endedAt: new Date(start + 2500) });
  for (const [key, event] of memory.events) closed.events.set(key, event);
  const confirmed = await recordProgress(closed.tx, input);
  assert.equal(confirmed.endedAt, new Date(start + 2500).toISOString()); assert.equal(confirmed.positionMs, 2000);
  assert.equal(closed.summaries(), 0); assert.equal(closed.events.size, 2);
  await assert.rejects(recordProgress(closed.tx, { sequence: 3, positionMs: 2000, listenedMsTotal: 2000 }), PlaybackError);
});

test("two equal requests under a simulated lock cause one write pair", async () => {
  const memory = memoryTransaction(); let tail = Promise.resolve();
  const input = { sequence: 1, positionMs: 1000, listenedMsTotal: 1000 };
  const locked = () => {
    const run = tail.then(() => recordProgress(memory.tx, input, () => row.startedAt.getTime() + 1000));
    tail = run.then(() => {}); return run;
  };
  const replies = await Promise.all([locked(), locked()]);
  assert.deepEqual(replies[0], replies[1]); assert.equal(memory.events.size, 1); assert.equal(memory.summaries(), 1);
  // Real PostgreSQL contention and rollback are proved separately in ECO-11.
});

test("progress validates request shape before the writer and preserves business errors", async t => {
  let writes = 0;
  const app = buildApp({ jwtSecret: "test-only-playback-secret", ready: async () => {}, readTrackDuration: async () => 6000,
    createSession: async () => toSession(row), progressSession: async (subject, sessionId, input) => {
      assert.equal(subject, owner); assert.equal(sessionId, id); writes++;
      throw new PlaybackError(409, "progress_conflict");
    } });
  t.after(() => app.close()); await app.ready();
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: owner })}` }, url = `/sessions/${id}/progress`;
  const valid = { sequence: 1, positionMs: 1000, listenedMsTotal: 1000 };
  assert.equal((await app.inject({ method: "PUT", url, payload: valid })).statusCode, 401);
  for (const payload of [{ ...valid, sequence: 0 }, { ...valid, sequence: 2147483648 }, { ...valid, positionMs: -1 },
    { ...valid, listenedMsTotal: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, listenedMsTotal: 1.5 }, { ...valid, userId: owner }]) {
    assert.equal(progressInput(payload), null);
    assert.equal((await app.inject({ method: "PUT", url, headers, payload })).statusCode, 400);
  }
  assert.equal(writes, 0);
  const result = await app.inject({ method: "PUT", url, headers, payload: valid });
  assert.equal(result.statusCode, 409); assert.equal(writes, 1);
});

test("progress writes event and summary together and bounds credit independently from position", async () => {
  const memory = memoryTransaction(), start = row.startedAt.getTime();
  const first = await recordProgress(memory.tx, { sequence: 1, positionMs: 5000, listenedMsTotal: 2000 }, () => start + 2000);
  assert.equal(first.listenedMs, 2000); assert.equal(first.positionMs, 5000); assert.equal(first.lastSequence, 1);
  assert.equal(memory.events.size, 1); assert.equal(memory.summaries(), 1); assert.equal(memory.events.get(1)?.listenedMsTotal, 2000n);
  const second = await recordProgress(memory.tx, { sequence: 2, positionMs: 1000, listenedMsTotal: 3000 }, () => start + 3000);
  assert.equal(second.listenedMs, 3000); assert.equal(second.positionMs, 1000);
  for (const input of [{ sequence: 4, positionMs: 1000, listenedMsTotal: 3000 }, { sequence: 3, positionMs: 6001, listenedMsTotal: 3000 },
    { sequence: 3, positionMs: 1000, listenedMsTotal: 2000 }]) {
    await assert.rejects(recordProgress(memory.tx, input, () => start + 4000), PlaybackError);
    assert.equal(memory.events.size, 2); assert.equal(memory.summaries(), 2); assert.deepEqual(memory.state(), { ...row, listenedMs: 3000n, lastSequence: 2 });
  }
  const excessive = await recordProgress(memory.tx, { sequence: 3, positionMs: 6000, listenedMsTotal: 1000000 }, () => start + 3500);
  assert.equal(excessive.listenedMs, 3500); assert.equal(memory.events.get(3)?.listenedMsTotal, 1000000n);
  const capped = await recordProgress(memory.tx, { sequence: 4, positionMs: 6000, listenedMsTotal: 2000000 }, () => start + 10000);
  assert.equal(capped.listenedMs, 6000);
  const closed = memoryTransaction({ ...row, endedAt: new Date(start + 1) });
  await assert.rejects(recordProgress(closed.tx, { sequence: 1, positionMs: 1, listenedMsTotal: 1 }), PlaybackError);
  assert.equal(closed.events.size, 0);
  const backwards = memoryTransaction();
  assert.equal((await recordProgress(backwards.tx, { sequence: 1, positionMs: 1, listenedMsTotal: 1000 }, () => start - 100)).listenedMs, 0);
});

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
