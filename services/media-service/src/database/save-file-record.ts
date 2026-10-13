/** Transaction Prisma de l’original et de son aperçu privé ; cover représente les images dans le modèle SQL existant. */
import type { PrismaClient } from "../generated/prisma/client.js";
import type { FileStore } from "../file-definitions.js";

/**
 * Construit le contrôle de présence par clé et la création SQL du fichier ready ; les variantes sont
 * créées dans la même opération atomique.
 */
export function fileStore(database: Pick<PrismaClient, "asset">): FileStore {
  return {
    /** Vérifie si une clé durable a été confirmée en base avant de nettoyer un upload interrompu. */
    hasStorageKey: async storageKey => Boolean(await database.asset.findUnique({ where: { storageKey }, select: { id: true } })),
    /**
     * Crée l’asset ready du propriétaire avec son original et, pour l’audio, sa variante MP3 private-
     * preview ; aucun dédoublonnage par checksum.
     */
    create: (id, uploaderUserId, file, storageKey, previewKey) => database.asset.create({ data: {
      id, uploaderUserId, purpose: file.purpose === "audio" ? "audio" : "cover", state: "ready", storageKey,
      mimeType: file.mimeType, byteSize: BigInt(file.byteSize), durationMs: file.durationMs === null ? null : BigInt(file.durationMs), checksumSha256: file.checksumSha256,
      ...(previewKey ? { variants: { create: { renditionKey: "private-preview", storageKey: previewKey, mimeType: "audio/mpeg", byteSize: BigInt(file.previewByteSize!), bitrateKbps: 128 } } } : {}),
    } }),
  };
}
