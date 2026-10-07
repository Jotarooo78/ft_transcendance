/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { ListeningClock } from "./listening-clock.ts";
import { PlaybackQueue, type TrackingStatus } from "./playback-queue.ts";
import type { PlaybackSession, ProgressPayload } from "./playback.ts";

const session: PlaybackSession = { id: "test-session", trackId: "test-track", trackDurationMs: 6000,
  startedAt: "2026-01-01T00:00:00Z", endedAt: null, listenedMs: 0, lastSequence: 0, positionMs: 0 };
const zero = { positionMs: 0, listenedMsTotal: 0 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test("queue retries identical payload after lost response and coalesces newer readings before close", async () => {
  const gate = deferred<void>(), calls: ProgressPayload[] = [], accepted = new Map<number, ProgressPayload>();
  let state = { ...session }, active = 0, maxActive = 0, closes = 0;
  const queue = new PlaybackQueue({ open: async () => session, isCurrent: () => true, notify: () => {}, delay: async () => {},
    progress: async (_id, payload) => {
      active++; maxActive = Math.max(maxActive, active); calls.push({ ...payload });
      if (calls.length === 1) await gate.promise;
      const previous = accepted.get(payload.sequence);
      if (previous) assert.deepEqual(previous, payload);
      else { accepted.set(payload.sequence, { ...payload }); state = { ...state, lastSequence: payload.sequence, positionMs: payload.positionMs, listenedMs: payload.listenedMsTotal }; }
      active--;
      if (calls.length === 1) throw new Error("Response lost after simulated write");
      return state;
    }, close: async () => { closes++; assert.equal(state.lastSequence, 2); return { ...state, endedAt: "2026-01-01T00:00:03Z" }; },
  });
  await queue.start(zero);
  queue.offer({ positionMs: 1000, listenedMsTotal: 1000 });
  queue.offer({ positionMs: 2000, listenedMsTotal: 2000 });
  const finished = queue.finish({ positionMs: 5000, listenedMsTotal: 3000 });
  gate.resolve(); await finished;
  assert.equal(maxActive, 1); assert.equal(closes, 1); assert.equal(accepted.size, 2);
  assert.deepEqual(calls.map(p => p.sequence), [1, 1, 2]); assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[2], { sequence: 2, positionMs: 5000, listenedMsTotal: 3000 });
});

test("exhausted retries retain the pending event and require an explicit retry before close", async () => {
  const calls: ProgressPayload[] = [], statuses: TrackingStatus[] = []; let outage = true, closes = 0;
  const queue = new PlaybackQueue({ open: async () => session, isCurrent: () => true, notify: s => statuses.push(s), delay: async () => {},
    progress: async (_id, payload) => { calls.push({ ...payload }); if (outage) throw new Error("offline");
      return { ...session, lastSequence: payload.sequence, positionMs: payload.positionMs, listenedMs: payload.listenedMsTotal }; },
    close: async () => { closes++; return { ...session, endedAt: "2026-01-01T00:00:01Z" }; },
  });
  await queue.start(zero); await queue.finish({ positionMs: 1000, listenedMsTotal: 1000 });
  assert.equal(calls.length, 3); assert.equal(closes, 0); assert.equal(statuses.at(-1)?.state, "error"); assert.equal(statuses.at(-1)?.canRetry, true);
  assert.deepEqual(calls[0], calls[1]); assert.deepEqual(calls[1], calls[2]);
  outage = false; queue.retry(); await queue.finish({ positionMs: 1000, listenedMsTotal: 1000 });
  assert.equal(calls.length, 4); assert.deepEqual(calls[2], calls[3]); assert.equal(closes, 1); assert.equal(statuses.at(-1)?.state, "closed");
});

test("a late opening after track detachment finishes only its own session without stale notifications", async () => {
  const opening = deferred<PlaybackSession>(), statuses: TrackingStatus[] = []; let progress = 0, closes = 0;
  const queue = new PlaybackQueue({ open: () => opening.promise, isCurrent: () => true, notify: s => statuses.push(s),
    progress: async (id, payload) => { assert.equal(id, session.id); progress++; return { ...session, lastSequence: payload.sequence }; },
    close: async id => { assert.equal(id, session.id); closes++; return { ...session, endedAt: "2026-01-01T00:00:01Z" }; },
  });
  const started = queue.start(zero); queue.detach({ positionMs: 500, listenedMsTotal: 500 });
  opening.resolve(session); await started;
  assert.equal(progress, 1); assert.equal(closes, 1); assert.deepEqual(statuses.map(s => s.state), ["opening"]);
});

test("changed account ignores late opening and stops subsequent requests", async () => {
  const opening = deferred<PlaybackSession>(); let current = true, requests = 0;
  const queue = new PlaybackQueue({ open: () => opening.promise, isCurrent: () => current, notify: () => {},
    progress: async () => { requests++; return session; }, close: async () => { requests++; return session; } });
  const started = queue.start(zero); current = false; opening.resolve(session); await started;
  await queue.finish({ positionMs: 1000, listenedMsTotal: 1000 }); queue.retry(); assert.equal(requests, 0);
});

test("uncertain opening is never retried automatically", async () => {
  let opens = 0; const statuses: TrackingStatus[] = [];
  const queue = new PlaybackQueue({ open: async () => { opens++; throw new Error("Opening reply lost"); }, isCurrent: () => true,
    notify: s => statuses.push(s), progress: async () => session, close: async () => session });
  await queue.start(zero); await queue.start({ positionMs: 1000, listenedMsTotal: 1000 }); queue.retry();
  await queue.finish({ positionMs: 2000, listenedMsTotal: 2000 });
  assert.equal(opens, 1); assert.equal(statuses.at(-1)?.state, "error"); assert.equal(statuses.at(-1)?.canRetry, false);
});

test("logout during an in-flight progress suppresses its result and any final close", async () => {
  const received = deferred<void>(), response = deferred<PlaybackSession>(), statuses: TrackingStatus[] = [];
  let current = true, writes = 0, closes = 0;
  const queue = new PlaybackQueue({ open: async () => session, isCurrent: () => current, notify: s => statuses.push(s),
    progress: async () => { writes++; received.resolve(); return response.promise; },
    close: async () => { closes++; return { ...session, endedAt: "2026-01-01T00:00:01Z" }; } });
  const started = queue.start({ positionMs: 1000, listenedMsTotal: 1000 });
  await received.promise; current = false; response.resolve({ ...session, lastSequence: 1 }); await started;
  await queue.finish({ positionMs: 2000, listenedMsTotal: 2000 });
  assert.equal(writes, 1); assert.equal(closes, 0); assert.equal(statuses.some(s => s.state === "saved"), false);
});

test("two seconds playing, three paused, seek and one resumed credit three seconds", () => {
  const clock = new ListeningClock();
  clock.sample({ nowMs: 0, positionMs: 0, playing: true });
  clock.sample({ nowMs: 1000, positionMs: 1000, playing: true });
  clock.sample({ nowMs: 2000, positionMs: 2000, playing: false });
  assert.deepEqual(clock.sample({ nowMs: 5000, positionMs: 2000, playing: false }), { positionMs: 2000, listenedMsTotal: 2000 });
  clock.sample({ nowMs: 5000, positionMs: 5000, playing: false, discontinuity: true });
  clock.sample({ nowMs: 5000, positionMs: 5000, playing: true, discontinuity: true });
  assert.deepEqual(clock.sample({ nowMs: 6000, positionMs: 6000, playing: false }), { positionMs: 6000, listenedMsTotal: 3000 });
});

test("waiting, stalled audio and long suspended intervals do not invent credit", () => {
  const clock = new ListeningClock();
  clock.sample({ nowMs: 0, positionMs: 0, playing: true });
  assert.equal(clock.sample({ nowMs: 1000, positionMs: 0, playing: true }).listenedMsTotal, 0);
  clock.sample({ nowMs: 1500, positionMs: 300, playing: false });
  clock.sample({ nowMs: 4500, positionMs: 300, playing: true });
  assert.equal(clock.sample({ nowMs: 5500, positionMs: 1300, playing: true }).listenedMsTotal, 1300);
  assert.equal(clock.sample({ nowMs: 35500, positionMs: 31300, playing: true }).listenedMsTotal, 1300);
  assert.equal(clock.sample({ nowMs: 36500, positionMs: 32300, playing: true }).listenedMsTotal, 2300);
});

test("jumps and backward seeks are separate from elapsed listening; reset starts a new track", () => {
  const clock = new ListeningClock();
  clock.sample({ nowMs: 0, positionMs: 0, playing: true });
  clock.sample({ nowMs: 1000, positionMs: 1000, playing: true });
  assert.equal(clock.sample({ nowMs: 1100, positionMs: 5000, playing: true }).listenedMsTotal, 1000);
  assert.equal(clock.sample({ nowMs: 1200, positionMs: 100, playing: true, discontinuity: true }).listenedMsTotal, 1000);
  assert.equal(clock.sample({ nowMs: 2200, positionMs: 1100, playing: true }).listenedMsTotal, 2000);
  clock.reset(); assert.deepEqual(clock.snapshot(), { positionMs: 0, listenedMsTotal: 0 });
  clock.sample({ nowMs: 3000, positionMs: 0, playing: true });
  assert.equal(clock.sample({ nowMs: 3500, positionMs: 500, playing: true }).listenedMsTotal, 500);
});

test("credit is bounded by both clocks and output contains safe integer milliseconds", () => {
  const clock = new ListeningClock();
  clock.sample({ nowMs: 0, positionMs: 0, playing: true });
  assert.deepEqual(clock.sample({ nowMs: 999.9, positionMs: 1100.4, playing: true }), { positionMs: 1100, listenedMsTotal: 999 });
  assert.equal(clock.sample({ nowMs: 1000.9, positionMs: 1100.9, playing: false }).listenedMsTotal, 1000);
  const snapshot = clock.snapshot();
  for (const bad of [NaN, Infinity, -1]) assert.throws(() => clock.sample({ nowMs: 1001, positionMs: bad, playing: true }));
  assert.deepEqual(clock.snapshot(), snapshot);
});
