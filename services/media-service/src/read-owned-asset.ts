/** Lecture SQL d’un fichier privé : le filtre propriétaire est appliqué dans la requête, avant tout retour de métadonnées. */
import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "./generated/prisma/client.js";
import { uuidPattern } from "./authenticate-user.js";

// The owner must come from authenticateUser, never from form or query data.
/**
 * Renvoie le fichier du compte avec son aperçu MP3 et sa pochette active, ou null si l’identité
 * manque, l’UUID est invalide ou le fichier appartient à un autre compte.
 */
export async function readOwnedAsset(
  database: Pick<PrismaClient, "asset">,
  request: Pick<FastifyRequest, "authenticatedUserId">,
  id: string,
) {
  const owner = request.authenticatedUserId;
  // Fail closed even if a future caller forgets the authentication hook.
  if (typeof owner !== "string" || !uuidPattern.test(owner) || !uuidPattern.test(id)) return null;
  return database.asset.findFirst({ where: { id: id.toLowerCase(), uploaderUserId: owner.toLowerCase() },
    include: { variants: { where: { renditionKey: { in: ["private-preview", "cover"] } } } } });
}
