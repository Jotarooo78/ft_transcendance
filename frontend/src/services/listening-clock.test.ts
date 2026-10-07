/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { ListeningClock } from "./listening-clock.ts";

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
