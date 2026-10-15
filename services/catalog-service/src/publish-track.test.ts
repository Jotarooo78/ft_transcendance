/** Contrôles de publication avec services HTTP et SQL simulés ; la campagne HTTPS vérifie ensuite leurs vraies écritures. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { parsePublication, registerTrackPublication } from "./publish-track.js";
import type { PrismaClient } from "./generated/prisma/client.js";

/** Identifiants réservés à ce scénario, sans compte utilisateur réel. */
const id = "11111111-1111-4111-8111-111111111111", owner = "22222222-2222-4222-8222-222222222222";
/** Proposition valide conservée entre les tentatives. */
const body = { audioAssetId: id, title: " My song ", description: "Credits" };

test("publication validates text and refuses client-controlled artist fields", () => {
  assert.equal(parsePublication(body)?.title, "My song");
  for (const invalid of [{ ...body, title: " " }, { ...body, title: "a".repeat(201) }, { ...body, description: "a".repeat(5001) }, { ...body, createdByUserId: owner }, { ...body, artistName: "Someone else" }, { ...body, audioAssetId: "wrong" }]) assert.equal(parsePublication(invalid), null);
});

test("publication is authenticated, reserves audio first and retries the same track after a lost response", async context => {
  const records = new Map<string, { id: string; createdByUserId: string; audioAssetId: string }>();
  let reserved = false, unavailable = false, lost = true;
  context.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    if (url.pathname === "/me") return Response.json({ userId: owner, displayName: "Artist", username: "artist", avatarUrl: null });
    assert.equal(JSON.parse(String(options.body)).ownerId, owner);
    if (unavailable) return Response.json({}, { status: 409 });
    reserved = true;
    return Response.json({ id, durationMs: 1200 });
  });
  const database = { track: { upsert: async ({ create }: { create: { id: string; createdByUserId: string; audioAssetId: string } }) => {
    assert(reserved); if (!records.has(create.id)) records.set(create.id, create); return records.get(create.id);
  } } } as unknown as PrismaClient;
  const app = Fastify();
  registerTrackPublication(app, database, async trackId => {
    if (lost) { lost = false; throw new Error("Response interrupted after commit"); }
    return { id: trackId, title: "My song", artistName: "Artist", albumTitle: "", genre: "", audioAssetId: id, audioUrl: `/api/media/assets/${id}/audio`, durationMs: 1200, durationSeconds: 1.2 };
  });
  try {
    assert.equal((await app.inject({ method: "POST", url: "/tracks", payload: body })).statusCode, 401);
    const request = { method: "POST" as const, url: "/tracks", headers: { authorization: "Bearer test-session" }, payload: body };
    unavailable = true; assert.equal((await app.inject(request)).statusCode, 409); assert.equal(records.size, 0);
    unavailable = false; assert.equal((await app.inject(request)).statusCode, 503); assert.equal(records.size, 1);
    const retry = await app.inject(request); assert.equal(retry.statusCode, 201); assert.equal(retry.json().id, id);
    const repeated = await Promise.all([app.inject(request), app.inject(request)]);
    assert(repeated.every(r => r.statusCode === 201)); assert.equal(records.size, 1);
  } finally { await app.close(); }
});
