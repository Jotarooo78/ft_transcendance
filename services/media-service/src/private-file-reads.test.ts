import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "./app.js";
import { fileReader } from "./database/list-files.js";
import type { PrismaClient } from "./generated/prisma/client.js";
import type { StoredFile, FileReader } from "./file-definitions.js";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";

test("private list queries both owner and state, preserves deterministic paging and exposes no paths", async t => {
  const calls: unknown[] = [];
  const asset: StoredFile = { id, uploaderUserId: owner, purpose: "audio", state: "ready", storageKey: "secret.original", mimeType: "audio/flac", byteSize: 42n, durationMs: 6000n, checksumSha256: "private-hash" };
  const database = { asset: {
    findMany: async (options: unknown) => { calls.push(options); return [asset]; },
    count: async (options: unknown) => { calls.push(options); return 2; },
  } } as unknown as Pick<PrismaClient, "asset">;
  const app = buildApp({ jwtSecret: "private-read-test", storageDir: "/unused", readAsset: async () => null,
    isPublished: async () => false, ready: async () => {}, fileReads: fileReader(database) });
  t.after(() => app.close()); await app.ready(); const token = app.jwt.sign({ sub: owner }, { expiresIn: "1h" });
  assert.equal((await app.inject("/assets")).statusCode, 401); assert.equal(calls.length, 0);
  const headers = { authorization: `Bearer ${token}` };
  const result = await app.inject({ url: "/assets?page=2&pageSize=1", headers });
  assert.equal(result.statusCode, 200); const data = result.json(); assert.equal(data.total, 2); assert.equal(data.page, 2);
  assert.deepEqual(Object.keys(data.items[0]).sort(), ["id", "usage", "state", "mimeType", "byteSize", "durationMs"].sort());
  assert.deepEqual(calls[0], { where: { uploaderUserId: owner, state: "ready", purpose: { in: ["audio", "cover"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, skip: 1 });
  for (const query of ["page=0", "pageSize=101", "page=1&page=2", "page=10000", "uploaderUserId=other", "pageSize=1.5"]) {
    assert.equal((await app.inject({ url: `/assets?${query}`, headers })).statusCode, 400);
  }
});

test("owner-only GET/HEAD serves exact image or MP3 variant bytes with no-store and uniform refusals", async t => {
  const directory = await mkdtemp(join(tmpdir(), "private-reads-")); const bytes = Buffer.from("validated-fixture-bytes");
  await writeFile(join(directory, "preview.mp3"), bytes); await writeFile(join(directory, "image.png"), bytes);
  await symlink(join(directory, "preview.mp3"), join(directory, "link")); await mkdir(join(directory, "directory"));
  const original = { id, uploaderUserId: owner, purpose: "audio", state: "ready", storageKey: "original.flac", mimeType: "audio/flac", byteSize: 500n, durationMs: 6000n, checksumSha256: "hash",
    variants: [{ storageKey: "preview.mp3", mimeType: "audio/mpeg", byteSize: BigInt(bytes.length) }] };
  let asset = { ...original }; let fail = false;
  const reads: FileReader = { list: async () => ({ items: [asset], total: 1 }), read: async (request, assetId) => {
    if (fail) throw new Error("SQL failure"); return request.authenticatedUserId === asset.uploaderUserId && assetId === asset.id ? asset : null;
  } };
  const app = buildApp({ jwtSecret: "private-read-test", storageDir: directory, readAsset: async () => null,
    isPublished: async () => false, ready: async () => {}, fileReads: reads });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); }); await app.ready();
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: owner }, { expiresIn: "1h" })}` };
  const otherHeaders = { authorization: `Bearer ${app.jwt.sign({ sub: other }, { expiresIn: "1h" })}` };
  const path = `/assets/${id}/private-content`;
  for (const method of ["GET", "HEAD"] as const) {
    const response = await app.inject({ method, url: path, headers }); assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "audio/mpeg"); assert.equal(response.headers["content-length"], String(bytes.length));
    assert.equal(response.headers["cache-control"], "no-store"); assert.deepEqual(response.rawPayload, method === "GET" ? bytes : Buffer.alloc(0));
    assert.equal((await app.inject({ method, url: path, headers: otherHeaders })).statusCode, 404);
    const unauthenticated = await app.inject({ method, url: path }); assert.equal(unauthenticated.statusCode, 401);
    if (method === "HEAD") assert.equal(unauthenticated.rawPayload.length, 0);
    assert.equal((await app.inject({ method, url: "/assets/bad/private-content", headers })).statusCode, 400);
  }
  for (const change of [{ state: "pending" }, { state: "deleted" }, { state: "deleting" }, { uploaderUserId: null }, { variants: [] },
    ...["missing", "link", "directory", "../preview.mp3"].map(storageKey => ({ variants: [{ ...original.variants[0]!, storageKey }] })),
    { variants: [{ ...original.variants[0]!, byteSize: 1n }] }]) {
    asset = { ...original, ...change } as typeof asset;
    assert.equal((await app.inject({ url: path, headers })).statusCode, 404);
  }
  asset = { ...original, purpose: "cover", storageKey: "image.png", mimeType: "image/png", byteSize: BigInt(bytes.length) };
  const image = await app.inject({ url: path, headers }); assert.equal(image.statusCode, 200); assert.deepEqual(image.rawPayload, bytes); assert.equal(image.headers["content-type"], "image/png");
  fail = true; assert.equal((await app.inject({ url: path, headers })).statusCode, 503);
});
