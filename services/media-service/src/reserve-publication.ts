/** Réservation durable d’un audio avant l’écriture Catalogue ; partage le verrou SQL de suppression. */
import type { PrismaClient } from "./generated/prisma/client.js";
import type { FastifyInstance } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { uuidPattern } from "./authenticate-user.js";

/** Installe une route interne inaccessible au navigateur ; une répétition conserve la même réservation. */
export function registerPublicationReservation(app: FastifyInstance, database: PrismaClient, secret: string) {
  app.put<{ Params: { id: string }; Body: { ownerId?: string } }>("/internal/assets/:id/publication", async (request, reply) => {
    const received = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) return reply.code(401).send({ error: "unauthorized" });
    const { id } = request.params;
    const ownerId = request.body?.ownerId;
    if (!uuidPattern.test(id) || typeof ownerId !== "string" || !uuidPattern.test(ownerId)) return reply.code(400).send({ error: "invalid_request" });
    const asset = await database.$transaction(async tx => {
      // Une réservation gagne le verrou avant le nettoyage, ou échoue si deleting a déjà gagné.
      const changed = await tx.asset.updateMany({ where: { id, uploaderUserId: ownerId, state: "ready", purpose: "audio",
        OR: [{ publicationTrackId: id }, { publicationTrackId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
        variants: { some: { renditionKey: "private-preview", byteSize: { gt: 0n } } },
      }, data: { publicationTrackId: id, expiresAt: null } });
      return changed.count ? tx.asset.findUnique({ where: { id } }) : null;
    });
    if (!asset) return reply.code(409).send({ error: "audio_not_available" });
    return { id: asset.id, durationMs: Number(asset.durationMs), mimeType: "audio/mpeg" };
  });
}
