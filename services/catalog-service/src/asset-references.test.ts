/** Tests du contrôle de références : SQL incluant les brouillons et accès HTTP réservé au token interne. */
import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "./generated/prisma/client.js";
import { isAssetReferenced } from "./database/check-asset-references.js";
import { buildApp } from "./app.js";

/** Identifiant stable de fixture, utilisé pour comparer les réponses du scénario. */
const id = "33333333-3333-4333-8333-333333333333";
test("reference lookup covers audio, release cover and artist image, including drafts", async () => {
  const calls: unknown[] = []; let selected = "";
  /**
   * Intercepte l’appel SQL pour vérifier le contrat des références et renvoyer le témoin contrôlé du
   * scénario.
   */
  const query = (kind: string) => async (args: unknown) => { calls.push(args); return selected === kind ? { id } : null; };
  const database = { track: { findFirst: query("audio") }, release: { findFirst: query("cover") }, artist: { findFirst: query("image") } } as unknown as Pick<PrismaClient, "track" | "release" | "artist">;
  for (selected of ["", "audio", "cover", "image"]) {
    calls.length = 0; assert.equal(await isAssetReferenced(database, id), selected !== "");
    assert.deepEqual(calls, [{ where: { audioAssetId: id }, select: { id: true } }, { where: { coverAssetId: id }, select: { id: true } }, { where: { imageAssetId: id }, select: { id: true } }]);
  }
});
test("internal references require a service token and fail closed on dependency errors", async t => {
  let reads = 0; let failure = false; let referenced = false;
  const options = {
    /** Doublure du scénario pour lecture de morceau ; la réponse ou la panne est contrôlée par le test. */
    readTrack: async () => null,
    /** Doublure du scénario pour disponibilité du stockage ; la réponse ou la panne est contrôlée par le test. */
    ready: async () => {},
    /** Doublure du scénario pour références du fichier ; la réponse ou la panne est contrôlée par le test. */
    isAssetReferenced: async () => { reads++; if (failure) throw new Error("SQL"); return referenced; } };
  assert.throws(() => buildApp(options), /INTERNAL_SERVICE_TOKEN/);
  const app = buildApp({ ...options, internalServiceToken: "internal-test-token" }); t.after(() => app.close());
  const path = `/internal/assets/${id}/references`;
  for (const authorization of [undefined, "Bearer invalid", "Bearer", "Bearer internal-test-tokeX"]) {
    assert.equal((await app.inject({ url: path, headers: authorization ? { authorization } : {} })).statusCode, 401);
  }
  assert.equal(reads, 0); const headers = { authorization: "Bearer internal-test-token" };
  for (referenced of [false, true]) { const result = await app.inject({ url: path, headers }); assert.equal(result.statusCode, 200); assert.deepEqual(result.json(), { referenced }); assert.equal(result.headers["cache-control"], "no-store"); }
  assert.equal((await app.inject({ url: "/internal/assets/bad/references", headers })).statusCode, 400);
  failure = true; assert.equal((await app.inject({ url: path, headers })).statusCode, 503);
});
