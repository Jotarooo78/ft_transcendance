import type { PrismaClient } from "../generated/prisma/client.js";

// No status filter: drafts also own references that deletion must preserve.
export async function isAssetReferenced(database: Pick<PrismaClient, "track" | "release" | "artist">, id: string) {
  const references = await Promise.all([
    database.track.findFirst({ where: { audioAssetId: id }, select: { id: true } }),
    database.release.findFirst({ where: { coverAssetId: id }, select: { id: true } }),
    database.artist.findFirst({ where: { imageAssetId: id }, select: { id: true } }),
  ]);
  return references.some(Boolean);
}
