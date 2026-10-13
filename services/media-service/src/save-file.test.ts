/** Tests d’upload et de stockage local : multipart, confirmation SQL, nettoyage, collision et reprise après résultat incertain. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, writeFile, mkdir, link, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { request } from "node:http";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { buildApp } from "./app.js";
import { demoAudio } from "./database/audio-fixture.js";
import { saveFile, recoverUploads } from "./save-file.js";
import type { FileStore, StoredFile } from "./file-definitions.js";
import type { ValidatedFile } from "./validate-file.js";

/** UUID du compte propriétaire de fixture. */
const owner = "11111111-1111-4111-8111-111111111111";
/**
 * Doublure des confirmations SQL conservant les métadonnées en mémoire pour observer nettoyage et
 * reprise des vrais fichiers temporaires.
 */
function store() {
  const records = new Map<string, StoredFile>(); const previews = new Map<string, string>();
  const database: FileStore = {
    /**
     * Doublure du scénario pour présence d’une confirmation de stockage ; la réponse ou la panne est
     * contrôlée par le test.
     */
    hasStorageKey: async key => [...records.values()].some(file => file.storageKey === key),
    /**
     * Doublure du scénario pour création des métadonnées du fichier ; la réponse ou la panne est contrôlée
     * par le test.
     */
    create: async (id, uploaderUserId, file: ValidatedFile, storageKey, previewKey) => {
      const asset: StoredFile = { id, uploaderUserId, purpose: file.purpose === "audio" ? "audio" : "cover", state: "ready", storageKey,
        mimeType: file.mimeType, byteSize: BigInt(file.byteSize), durationMs: file.durationMs === null ? null : BigInt(file.durationMs), checksumSha256: file.checksumSha256 };
      records.set(id, asset); if (previewKey) previews.set(id, previewKey); return asset;
    },
  };
  return { database, records, previews };
}
/** Construit le corps d’upload avec nom de champ, contenu et MIME contrôlés. */
function multipart(bytes: Buffer, mime = "audio/wav", extra = "") {
  return Buffer.concat([Buffer.from(`--fixture\r\nContent-Disposition: form-data; name="file"; filename="../../untrusted.wav"\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n${extra}--fixture--\r\n`)]);
}

test("authenticated POST stores real original and MP3 preview; owner and paths never come from form", async t => {
  const directory = await mkdtemp(join(tmpdir(), "file-post-")); const data = store();
  const app = buildApp({ jwtSecret: "upload-test-secret", storageDir: directory, files: data.database,
    /**
     * Doublure du scénario pour métadonnées du fichier audio ; la réponse ou la panne est contrôlée par le
     * test.
     */
    readAsset: async () => null,
      /** Doublure du scénario pour publication de l’audio ; la réponse ou la panne est contrôlée par le test. */
      isPublished: async () => false,
      /** Doublure du scénario pour disponibilité du stockage ; la réponse ou la panne est contrôlée par le test. */
      ready: async () => {} });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); });
  await app.ready(); const token = app.jwt.sign({ sub: owner }, { expiresIn: "1h" }); const bytes = demoAudio(1);
  /** Envoie le multipart à l’application injectée avec le JWT de test. */
  const post = (body: Buffer, auth = true) => app.inject({ method: "POST", url: "/assets", headers: {
    "content-type": "multipart/form-data; boundary=fixture", ...(auth ? { authorization: `Bearer ${token}` } : {}) }, payload: body });
  assert.equal((await post(multipart(bytes), false)).statusCode, 401); assert.equal(data.records.size, 0);
  const result = await post(multipart(bytes)); assert.equal(result.statusCode, 201, result.body);
  const response = result.json(); assert.equal(response.state, "ready"); assert.equal(response.usage, "audio"); assert.equal(response.durationMs, 6000);
  assert.equal(response.storageKey, undefined); assert.equal(response.uploaderUserId, undefined);
  const asset = data.records.get(response.id)!; assert.equal(asset.uploaderUserId, owner);
  assert.deepEqual(await readFile(join(directory, asset.storageKey)), bytes);
  assert.equal(asset.checksumSha256, createHash("sha256").update(bytes).digest("hex"));
  const preview = join(directory, data.previews.get(asset.id)!);
  assert.ok((await lstat(preview)).size > 0);
  assert.match(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name", "-of", "json", preview]).toString(), /mp3/);
  assert.equal((await post(multipart(bytes, "image/png"))).statusCode, 415);
  assert.equal((await post(multipart(Buffer.alloc(0)))).statusCode, 400);
  assert.equal((await post(multipart(bytes.subarray(0, 1000)))).statusCode, 415);
  const field = '--fixture\r\nContent-Disposition: form-data; name="uploaderUserId"\r\n\r\nforged\r\n';
  assert.equal((await post(multipart(bytes, "audio/wav", field))).statusCode, 400);
  const second = '--fixture\r\nContent-Disposition: form-data; name="file"; filename="second.wav"\r\nContent-Type: audio/wav\r\n\r\nnot-audio\r\n';
  assert.equal((await post(multipart(bytes, "audio/wav", second))).statusCode, 400);
  assert.equal(data.records.size, 1); assert.equal((await readdir(directory)).length, 2);
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "blue" } }).png().toBuffer();
  const image = await post(multipart(png, "image/png")); assert.equal(image.statusCode, 201, image.body);
  assert.equal(image.json().usage, "image"); assert.equal(image.json().durationMs, null);
  const imageAsset = data.records.get(image.json().id)!;
  assert.deepEqual(await readFile(join(directory, imageAsset.storageKey)), png);
  const tooLarge = Buffer.alloc(25_000_001); png.copy(tooLarge);
  assert.equal((await post(multipart(tooLarge, "image/png"))).statusCode, 413);
  assert.equal(data.records.size, 2); assert.equal((await readdir(directory)).length, 3);
});

test("SQL failure compensates; uncertain commits retain durable markers and recover without deleting confirmed files", async t => {
  const directory = await mkdtemp(join(tmpdir(), "file-sql-")); const data = store();
  t.after(() => rm(directory, { recursive: true })); const bytes = demoAudio(1);
  /** Écrit l’original du scénario dans le chemin temporaire reçu par saveFile, puis annonce son MIME. */
  const receive = async (path: string) => { await writeFile(path, bytes); return "audio/wav"; };
  const failed: FileStore = { ...data.database,
    /** Doublure du scénario pour création des métadonnées du fichier ; la réponse ou la panne est contrôlée par le test. */
    create: async () => { throw new Error("database offline"); } };
  await assert.rejects(saveFile(directory, owner, failed, receive)); assert.deepEqual(await readdir(directory), []);
  const uncertain: FileStore = { ...failed,
    /** Doublure du scénario pour présence d’une confirmation de stockage ; la réponse ou la panne est contrôlée par le test. */
    hasStorageKey: async () => { throw new Error("database offline"); } };
  await assert.rejects(saveFile(directory, owner, uncertain, receive));
  assert.equal((await readdir(directory)).length, 3);
  await recoverUploads(directory, data.database); assert.deepEqual(await readdir(directory), []);
  const committed: FileStore = { ...data.database,
    /** Doublure du scénario pour création des métadonnées du fichier ; la réponse ou la panne est contrôlée par le test. */
    create: async (...args) => { await data.database.create(...args); throw new Error("lost SQL acknowledgement"); } };
  await assert.rejects(saveFile(directory, owner, committed, receive));
  assert.equal(data.records.size, 1); assert.equal((await readdir(directory)).length, 2);
  const asset = [...data.records.values()][0]!; assert.deepEqual(await readFile(join(directory, asset.storageKey)), bytes);
});

test("startup recovery is bounded, leaves seeds and collisions intact, and finishes interrupted publications", async t => {
  const directory = await mkdtemp(join(tmpdir(), "file-recovery-")); const data = store();
  t.after(() => rm(directory, { recursive: true }));
  await writeFile(join(directory, "seed.wav"), "seed");
  const id = "22222222-2222-4222-8222-222222222222"; const staging = join(directory, `.upload-${id}`);
  await mkdir(staging); await writeFile(join(staging, "original"), demoAudio(1)); await link(join(staging, "original"), join(directory, `${id}.original`));
  await assert.rejects(recoverUploads(directory, data.database, 0));
  assert.equal(await recoverUploads(directory, data.database), 1); assert.deepEqual(await readdir(directory), ["seed.wav"]);
  await mkdir(staging); await writeFile(join(staging, "original"), "ours"); await writeFile(join(directory, `${id}.original`), "collision");
  await recoverUploads(directory, data.database); assert.equal(await readFile(join(directory, `${id}.original`), "utf8"), "collision");
  assert.equal(await readFile(join(directory, "seed.wav"), "utf8"), "seed");
});

test("a real aborted HTTP upload closes the stream and removes its staging file", async t => {
  const directory = await mkdtemp(join(tmpdir(), "file-abort-")); const data = store();
  const app = buildApp({ jwtSecret: "upload-test-secret", storageDir: directory, files: data.database,
    /**
     * Doublure du scénario pour métadonnées du fichier audio ; la réponse ou la panne est contrôlée par le
     * test.
     */
    readAsset: async () => null,
      /** Doublure du scénario pour publication de l’audio ; la réponse ou la panne est contrôlée par le test. */
      isPublished: async () => false,
      /** Doublure du scénario pour disponibilité du stockage ; la réponse ou la panne est contrôlée par le test. */
      ready: async () => {} });
  t.after(async () => { await app.close(); await rm(directory, { recursive: true }); });
  await app.listen({ port: 0, host: "127.0.0.1" }); const address = app.server.address(); assert.ok(address && typeof address !== "string");
  const token = app.jwt.sign({ sub: owner }, { expiresIn: "1h" });
  const upload = request({ hostname: "127.0.0.1", port: address.port, path: "/assets", method: "POST", headers: {
    authorization: `Bearer ${token}`, "content-type": "multipart/form-data; boundary=fixture", "content-length": 1000000 } });
  upload.on("error", () => {}); upload.write(multipart(demoAudio(1)).subarray(0, 500));
  for (let attempt = 0; attempt < 100 && !(await readdir(directory)).length; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok((await readdir(directory)).length); upload.destroy();
  for (let attempt = 0; attempt < 100 && (await readdir(directory)).length; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(await readdir(directory), []); assert.equal(data.records.size, 0);
});
