/** Protection des fichiers encore utilisés par le catalogue, y compris les brouillons. */
import type { PrismaClient } from "../generated/prisma/client.js";

// No status filter: drafts also own references that deletion must preserve.
/**
 * Cherche une référence audio de morceau, couverture de sortie ou image d’artiste. Renvoie seulement
 * un booléen ; aucun filtre published ne doit exclure les brouillons.
 */
export async function isAssetReferenced(database: Pick<PrismaClient, "track" | "release" | "artist">, id: string) {
  const references = await Promise.all([
    database.track.findFirst({ where: { audioAssetId: id }, select: { id: true } }),
    database.release.findFirst({ where: { coverAssetId: id }, select: { id: true } }),
    database.artist.findFirst({ where: { imageAssetId: id }, select: { id: true } }),
  ]);
  return references.some(Boolean);
}
