/** Tests JWT et filtre SQL de propriétaire : absence, expiration et compte étranger ne doivent pas révéler un fichier. */
import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { buildApp } from "./app.js";
import { authenticateUser } from "./authenticate-user.js";
import { readOwnedAsset } from "./read-owned-asset.js";
import type { Asset, PrismaClient } from "./generated/prisma/client.js";

const ownerA = "aaaaaaaa-0000-4000-8000-000000000001";
const ownerB = "bbbbbbbb-0000-4000-8000-000000000002";
const idA = "aaaaaaaa-0000-4000-8000-000000000003";
const idB = "bbbbbbbb-0000-4000-8000-000000000004";
const seedId = "cccccccc-0000-4000-8000-000000000005";
const absentId = "dddddddd-0000-4000-8000-000000000006";
/** Opérations de transport et notifications injectées dans la file. */
const options = { jwtSecret: "media-test-secret", storageDir: "/unused",
  /** Doublure du scénario pour disponibilité du stockage ; la réponse ou la panne est contrôlée par le test. */
  ready: async () => {},
  /**
   * Doublure du scénario pour métadonnées du fichier audio ; la réponse ou la panne est contrôlée par le
   * test.
   */
  readAsset: async () => null,
    /** Doublure du scénario pour publication de l’audio ; la réponse ou la panne est contrôlée par le test. */
    isPublished: async () => false };

test("Media requires a configured secret", () => {
  for (const jwtSecret of ["", "   "]) assert.throws(() => buildApp({ ...options, jwtSecret }), /JWT_SECRET/);
});

test("verified sessions scope file access and refuse invalid tokens before database reads", async t => {
  const assets = [
    { id: idA, uploaderUserId: ownerA }, { id: idB, uploaderUserId: ownerB }, { id: seedId, uploaderUserId: null },
  ];
  const reads: Array<{
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string;
    /** UUID du compte ayant envoyé l’original ; null pour les fichiers sans propriétaire utilisateur. */
    uploaderUserId: string }> = [];
  // Database double: capture the actual Prisma predicate, then apply both filters.
  const database = { asset: {
    /** Doublure du scénario pour filtre de lecture SQL par propriétaire ; la réponse ou la panne est contrôlée par le test. */
    findFirst: async ({ where }: {
    /** Filtre SQL attendu par la doublure afin de vérifier la portée propriétaire. */
    where: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string;
    /** UUID du compte ayant envoyé l’original ; null pour les fichiers sans propriétaire utilisateur. */
    uploaderUserId: string } }) => {
    reads.push(where);
    return assets.find(asset => asset.id === where.id && asset.uploaderUserId === where.uploaderUserId) ?? null;
  } } } as unknown as Pick<PrismaClient, "asset">;
  const app = buildApp(options);
  // Test-only route exercises the future private route composition, without shipping an endpoint.
  app.post<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/test-private/:id", { onRequest: authenticateUser }, async (request, reply) => {
    const asset = await readOwnedAsset(database, request, request.params.id);
    return asset ? { id: asset.id, owner: request.authenticatedUserId } : reply.code(404).send({ error: "media_not_found" });
  });
  const otherIssuer = Fastify();
  otherIssuer.register(jwt, { secret: "different-test-secret" });
  t.after(async () => { await app.close(); await otherIssuer.close(); });
  await app.ready(); await otherIssuer.ready();
  /** Signe les claims contrôlées du scénario avec le secret de test Media. */
  const sign = (payload: Record<string, unknown>) => app.jwt.sign({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload });
  const tokenA = sign({ sub: ownerA.toUpperCase() });
  const [header, payload, signature] = tokenA.split(".");
  assert.ok(header && payload && signature);
  const tampered = `${header}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), sub: ownerB })).toString("base64url")}.${signature}`;
  const refusedTokens = [
    undefined, "", "not-a-jwt", tampered,
    otherIssuer.jwt.sign({ sub: ownerA }, { expiresIn: "1h" }),
    sign({ sub: ownerA, exp: Math.floor(Date.now() / 1000) - 60 }),
    app.jwt.sign({ sub: ownerA }),
    sign({ sub: ownerA, nbf: Math.floor(Date.now() / 1000) + 3600 }),
    ...[undefined, null, 42, {}, [], "", "not-a-uuid"].map(sub => sign({ sub })),
  ];
  for (const token of refusedTokens) {
    const response = await app.inject({ method: "POST", url: `/test-private/${idA}`,
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` } });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: "unauthorized" });
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(reads.length, 0, "no private database read after rejected authentication");
  }
  for (const [owner, ownId, foreignId] of [[ownerA, idA, idB], [ownerB, idB, idA]] as const) {
    const authorization = `Bearer ${sign({ sub: owner.toUpperCase() })}`;
    const own = await app.inject({ method: "POST", url: `/test-private/${ownId.toUpperCase()}`,
      headers: { authorization }, payload: { uploaderUserId: owner === ownerA ? ownerB : ownerA } });
    assert.equal(own.statusCode, 200);
    assert.deepEqual(own.json(), { id: ownId, owner });
    assert.deepEqual(reads.at(-1), { id: ownId, uploaderUserId: owner });
    for (const id of [foreignId, seedId, absentId]) {
      const response = await app.inject({ method: "POST", url: `/test-private/${id}?uploaderUserId=${ownerB}`,
        headers: { authorization }, payload: { uploaderUserId: ownerB } });
      assert.equal(response.statusCode, 404);
      assert.deepEqual(response.json(), { error: "media_not_found" });
      assert.deepEqual(reads.at(-1), { id, uploaderUserId: owner });
    }
  }
  const before = reads.length;
  assert.equal(await readOwnedAsset(database, {}, idA), null);
  assert.equal(await readOwnedAsset(database, { authenticatedUserId: "bad" }, idA), null);
  assert.equal(await readOwnedAsset(database, { authenticatedUserId: ownerA }, "bad"), null);
  assert.equal(reads.length, before);
  const unauthenticated = await app.inject({ method: "POST", url: `/test-private/${idA}` });
  assert.equal(unauthenticated.statusCode, 401, "identity does not leak between requests");
  assert.equal(reads.length, before);
  assert.equal((await app.inject(`/assets/${idA}`)).statusCode, 404, "no production private endpoint yet");
});

test("private database failures propagate rather than becoming successful or missing results", async () => {
  const database = { asset: {
    /** Doublure du scénario pour filtre de lecture SQL par propriétaire ; la réponse ou la panne est contrôlée par le test. */
    findFirst: async (): Promise<Asset | null> => { throw new Error("database unavailable"); } } } as unknown as Pick<PrismaClient, "asset">;
  await assert.rejects(readOwnedAsset(database, { authenticatedUserId: ownerA }, idA), /database unavailable/);
});
