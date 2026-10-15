/** Nettoyage borné des uploads abandonnés ; une réservation ou une référence Catalogue interdit l’effacement. */
import type { PrismaClient } from "./generated/prisma/client.js";
import type { FileDeletion } from "./file-definitions.js";
import { deleteFile } from "./delete-file.js";

/** Efface au plus 100 uploads expirés ; les fichiers historiques et les publications incertaines restent conservés. */
export async function expireUploads(database: PrismaClient, files: FileDeletion, directory: string) {
  const expired = await database.asset.findMany({ where: { state: "ready", expiresAt: { lte: new Date() }, publicationTrackId: null }, take: 100, orderBy: { expiresAt: "asc" } });
  for (const asset of expired) {
    try { await deleteFile(directory, files, { authenticatedUserId: asset.uploaderUserId! }, asset.id); }
    catch (error) { if ((error as { status?: number }).status !== 409) throw error; }
  }
}
