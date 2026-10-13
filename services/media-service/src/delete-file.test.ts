import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "./app.js";
import { deleteFile, recoverDeletions } from "./delete-file.js";
import { catalogReferences } from "./check-catalog-references.js";
import type { FileDeletion } from "./file-definitions.js";

const owner = "11111111-1111-4111-8111-111111111111"; const other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
function deletionStore() {
  const asset = { id, uploaderUserId: owner, purpose: "audio", state: "ready", storageKey: "original", mimeType: "audio/wav", byteSize: 5n, durationMs: 1000n, checksumSha256: "hash",
    variants: [{ storageKey: "preview", mimeType: "audio/mpeg", byteSize: 5n }] };
  let used = false; let catalogFailure = false; let databaseFailure = false;
  const files: FileDeletion = {
    read: async (request, value) => value === id && request.authenticatedUserId === asset.uploaderUserId ? { ...asset } : null,
    referenced: async () => { if (catalogFailure) throw new Error("catalog offline"); return used; },
    markDeleting: async (_id, user) => { if (asset.state !== "ready" || user !== owner) return false; asset.state = "deleting"; return true; },
    markDeleted: async () => { if (databaseFailure) throw new Error("SQL offline"); asset.state = "deleted"; },
    pending: async () => asset.state === "deleting" ? [{ ...asset }] : [],
  };
  return { asset, files, setUsed: (value: boolean) => { used = value; }, setCatalogFailure: (value: boolean) => { catalogFailure = value; }, setDatabaseFailure: (value: boolean) => { databaseFailure = value; } };
}

test("DELETE protects other accounts, seeds and references, refuses outages, and is concurrent/idempotent", async t => {
  const directory = await mkdtemp(join(tmpdir(), "file-delete-")); const state = deletionStore();
  await writeFile(join(directory, "original"), "audio"); await writeFile(join(directory, "preview"), "audio"); await writeFile(join(directory, "seed"), "seed");
  const app = buildApp({ jwtSecret: "deletion-test", storageDir: directory, fileDeletes: state.files,
    readAsset: async () => null, isPublished: async () => false, ready: async () => {} });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); }); await app.ready();
  const path = `/assets/${id}`; const headers = { authorization: `Bearer ${app.jwt.sign({ sub: owner }, { expiresIn: "1h" })}` };
  const remove = () => app.inject({ method: "DELETE", url: path, headers });
  assert.equal((await app.inject({ method: "DELETE", url: path })).statusCode, 401);
  assert.equal((await app.inject({ method: "DELETE", url: path, headers: { authorization: `Bearer ${app.jwt.sign({ sub: other }, { expiresIn: "1h" })}` } })).statusCode, 404);
  state.asset.uploaderUserId = null as unknown as string; assert.equal((await remove()).statusCode, 404); state.asset.uploaderUserId = owner;
  state.setUsed(true); assert.equal((await remove()).statusCode, 409); assert.equal(state.asset.state, "ready");
  assert.equal(await readFile(join(directory, "original"), "utf8"), "audio");
  state.setUsed(false); state.setCatalogFailure(true); assert.equal((await remove()).statusCode, 503); assert.equal(state.asset.state, "ready");
  state.setCatalogFailure(false);
  const concurrent = await Promise.all([remove(), remove()]); assert.deepEqual(concurrent.map(r => r.statusCode), [204, 204]);
  assert.equal(state.asset.state, "deleted"); assert.deepEqual(await readdir(directory), ["seed"]);
  assert.equal((await remove()).statusCode, 204); assert.equal(await readFile(join(directory, "seed"), "utf8"), "seed");
});

test("interrupted deletion remains deleting until recovery confirms SQL, including already absent bytes", async t => {
  const directory = await mkdtemp(join(tmpdir(), "file-delete-recovery-")); const state = deletionStore();
  t.after(() => rm(directory, { recursive: true }));
  await writeFile(join(directory, "original"), "audio"); await writeFile(join(directory, "preview"), "audio");
  state.setDatabaseFailure(true);
  await assert.rejects(deleteFile(directory, state.files, { authenticatedUserId: owner }, id));
  assert.equal(state.asset.state, "deleting"); assert.deepEqual(await readdir(directory), []);
  state.setDatabaseFailure(false); assert.equal(await recoverDeletions(directory, state.files), 1); assert.equal(state.asset.state, "deleted");
  assert.equal(await recoverDeletions(directory, state.files), 0);
});

test("references HTTP client sends service authorization and refuses bad, failed or timed out responses", async t => {
  let mode = "true"; let auth = "";
  const server = createServer((request, response) => {
    auth = request.headers.authorization ?? ""; if (mode === "timeout") return;
    response.statusCode = mode === "failure" ? 503 : 200;
    response.end(mode === "bad" ? '{"referenced":"no"}' : mode === "large" ? "x".repeat(5000) : JSON.stringify({ referenced: mode === "true" }));
  }); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); }); const address = server.address(); assert.ok(address && typeof address !== "string");
  const read = catalogReferences(`http://127.0.0.1:${address.port}`, "internal-test-token", 100);
  assert.equal(await read(id), true); assert.equal(auth, "Bearer internal-test-token"); mode = "false"; assert.equal(await read(id), false);
  for (mode of ["bad", "large", "failure", "timeout"]) await assert.rejects(read(id));
});
