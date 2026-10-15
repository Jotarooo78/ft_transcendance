/** Diffusion d’une pochette uniquement après publication de son audio. */
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "./generated/prisma/client.js";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { uuidPattern } from "./authenticate-user.js";

/** Sert l’image validée depuis le volume ; vérifie la publication avant chaque GET ou HEAD. */
export function registerPublicArtwork(app: FastifyInstance, database: PrismaClient, directory: string, isPublished: (id: string) => Promise<boolean>) {
  app.route<{ Params: { id: string } }>({ method: ["GET", "HEAD"], url: "/assets/:id/artwork", handler: async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!uuidPattern.test(request.params.id)) return reply.code(400).send();
    const id = request.params.id.toLowerCase();
    try {
      if (!await isPublished(id)) return reply.code(404).send();
      const asset = await database.asset.findFirst({ where: { id, state: "ready", purpose: "audio" }, include: { variants: { where: { renditionKey: "cover" } } } });
      const cover = asset?.variants[0];
      if (!cover || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(cover.storageKey) || !["image/png", "image/jpeg", "image/webp"].includes(cover.mimeType)) return reply.code(404).send();
      const file = await open(join(directory, cover.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size !== Number(cover.byteSize)) return reply.code(404).send();
        reply.header("Content-Type", cover.mimeType).header("Content-Length", stat.size).header("X-Content-Type-Options", "nosniff");
        if (request.method === "HEAD") return reply.send();
        // Lecture bornée aux 25 Mo déjà contrôlés à l’envoi ; fermeture garantie avant réponse.
        return reply.send(await file.readFile());
      } finally { await file.close(); }
    } catch { return reply.code(503).send(); }
  } });
}
