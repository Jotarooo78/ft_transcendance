import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, symlink, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { buildApp, type AudioAsset } from "./app.js";
import { demoAudio } from "./database/audio-fixture.js";
import { publicationReader } from "./publication.js";

const id = "30000000-0000-4000-8000-000000000001";
const path = `/assets/${id}/audio`;

test("real file bytes, metadata checks, confined paths and dependency errors", async t => {
  const dir = await mkdtemp(join(tmpdir(), "media-test-"));
  const bytes = demoAudio(1);
  await writeFile(join(dir, "demo.wav"), bytes);
  await symlink(join(dir, "demo.wav"), join(dir, "link.wav"));
  await mkdir(join(dir, "directory"));
  const original: AudioAsset = { purpose: "audio", state: "ready", storageKey: "demo.wav", mimeType: "audio/wav", byteSize: BigInt(bytes.length) };
  let asset = { ...original }; let published = true; let failure = false;
  const app = buildApp({ storageDir: dir, ready: async () => { if (failure) throw new Error("db"); },
    readAsset: async value => value === id ? asset : null,
    isPublished: async () => { if (failure) throw new Error("catalog"); return published; } });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const r = await app.inject(path);
  assert.equal(r.statusCode, 200); assert.deepEqual(r.rawPayload, bytes);
  assert.equal(r.headers["content-type"], "audio/wav");
  assert.equal(r.headers["content-length"], String(bytes.length));
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.headers["accept-ranges"], "bytes");
  assert.equal((await app.inject('/assets/no/audio')).statusCode, 400);
  assert.equal((await app.inject('/assets/30000000-0000-4000-8000-000000000099/audio')).statusCode, 404);
  for (const change of [{ state: "pending" }, { purpose: "avatar" }, { storageKey: "../demo.wav" },
    { storageKey: "a\\demo.wav" }, { storageKey: "/demo.wav" }, { storageKey: "link.wav" },
    { storageKey: "directory" }, { storageKey: "missing.wav" }, { byteSize: 10n }, { byteSize: null },
    { byteSize: 9007199254740992n }, { mimeType: "text/html" }]) {
    asset = { ...original, ...change };
    const refused = await app.inject(path);
    assert.equal(refused.statusCode, 404, JSON.stringify(change, (_, v) => typeof v === "bigint" ? String(v) : v));
    assert.deepEqual(refused.json(), { error: "media_not_found" });
  }
  asset = original; published = false;
  assert.equal((await app.inject(path)).statusCode, 404);
  published = true; failure = true;
  assert.equal((await app.inject(path)).statusCode, 503);
  assert.equal((await app.inject('/ready')).statusCode, 503);
  assert.equal((await app.inject('/health')).statusCode, 200);
  assert.match((await app.inject('/metrics')).body, /media_service_/);
});

test("publication HTTP client rejects malformed, failed and timed-out responses", async t => {
  let mode = "true";
  const server = createServer((_req, res) => {
    if (mode === "timeout") return;
    res.statusCode = mode === "failure" ? 503 : 200;
    res.end(mode === "bad" ? '{"published":"yes"}' : JSON.stringify({ published: mode === "true" }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const read = publicationReader(`http://127.0.0.1:${address.port}`, 100);
  assert.equal(await read(id), true); mode = "false"; assert.equal(await read(id), false);
  for (mode of ["bad", "failure", "timeout"]) await assert.rejects(read(id));
});
