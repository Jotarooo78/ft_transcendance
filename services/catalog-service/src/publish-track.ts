/** Publication depuis un compte : validation, réservation Media durable puis création unique en Catalogue. */
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "./generated/prisma/client.js";
import { uuidPattern, type TrackDto } from "./catalog.js";
import { isArtistProfile } from "./read-artist-profile.js";

/** Informations éditables ; l’identité et la durée proviennent exclusivement des services responsables. */
export type TrackPublication = {
  /** Audio déjà reçu par Media, également utilisé comme identifiant stable de la publication. */
  audioAssetId: string;
  /** Titre nettoyé, de 1 à 200 caractères. */
  title: string;
  /** Texte facultatif, de 0 à 5 000 caractères. */
  description: string;
};
/** Refuse les champs d’identité injectés et les valeurs hors limites avant toute réservation. */
export function parsePublication(body: unknown): TrackPublication | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(key => !["audioAssetId", "title", "description"].includes(key)) ||
    typeof b.audioAssetId !== "string" || !uuidPattern.test(b.audioAssetId) || typeof b.title !== "string" ||
    !b.title.trim() || [...b.title.trim()].length > 200 || typeof b.description !== "string" || [...b.description].length > 5000) return null;
  return { audioAssetId: b.audioAssetId.toLowerCase(), title: b.title.trim(), description: b.description.trim() };
}
/** Installe la publication ; Users authentifie la session et Media arbitre publication contre suppression. */
export function registerTrackPublication(app: FastifyInstance, database: PrismaClient, readTrack: (id: string) => Promise<TrackDto | null>) {
  app.post("/tracks", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return reply.code(401).send({ error: "unauthorized" });
    const data = parsePublication(request.body);
    if (!data) return reply.code(400).send({ error: "invalid_publication" });
    try {
      const users = process.env.USER_SERVICE_URL ?? "http://user-service:4001";
      const response = await fetch(new URL("/me", users), { headers: { Authorization: authorization }, signal: AbortSignal.timeout(5000) });
      if (response.status === 401) return reply.code(401).send({ error: "unauthorized" });
      if (!response.ok) throw new Error("Profile unavailable");
      const profile: unknown = await response.json();
      if (!isArtistProfile(profile)) throw new Error("Invalid profile");
      const media = process.env.MEDIA_SERVICE_URL ?? "http://media-service:4003";
      const reserved = await fetch(new URL(`/internal/assets/${data.audioAssetId}/publication`, media), {
        method: "PUT", headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: profile.userId }), signal: AbortSignal.timeout(5000),
      });
      if (reserved.status === 409) return reply.code(409).send({ error: "audio_not_available" });
      if (!reserved.ok) throw new Error("Media unavailable");
      const audio = await reserved.json() as { id: string; durationMs: number };
      if (audio.id !== data.audioAssetId || !Number.isSafeInteger(audio.durationMs) || audio.durationMs <= 0) throw new Error("Invalid audio confirmation");
      // L’UUID stable et l’upsert rendent les doubles clics et reprises convergents. Aucun nom d’artiste copié.
      const track = await database.track.upsert({ where: { id: data.audioAssetId }, update: {}, create: {
        id: data.audioAssetId, audioAssetId: data.audioAssetId, title: data.title, description: data.description || null,
        createdByUserId: profile.userId, durationMs: BigInt(audio.durationMs), status: "published", publishedAt: new Date(),
      } });
      if (track.createdByUserId !== profile.userId || track.audioAssetId !== data.audioAssetId) return reply.code(409).send({ error: "publication_conflict" });
      const result = await readTrack(track.id);
      if (!result) throw new Error("Publication unavailable");
      return reply.code(201).send(result);
    } catch (error) {
      request.log.error(error, "Publication can be retried with the same audio");
      return reply.code(503).send({ error: "publication_unavailable" });
    }
  });
}
