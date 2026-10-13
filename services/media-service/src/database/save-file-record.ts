import type { PrismaClient } from "../generated/prisma/client.js";
import type { FileStore } from "../file-definitions.js";

export function fileStore(database: Pick<PrismaClient, "asset">): FileStore {
  return {
    hasStorageKey: async storageKey => Boolean(await database.asset.findUnique({ where: { storageKey }, select: { id: true } })),
    create: (id, uploaderUserId, file, storageKey, previewKey) => database.asset.create({ data: {
      id, uploaderUserId, purpose: file.purpose === "audio" ? "audio" : "cover", state: "ready", storageKey,
      mimeType: file.mimeType, byteSize: BigInt(file.byteSize), durationMs: file.durationMs === null ? null : BigInt(file.durationMs), checksumSha256: file.checksumSha256,
      ...(previewKey ? { variants: { create: { renditionKey: "private-preview", storageKey: previewKey, mimeType: "audio/mpeg", byteSize: BigInt(file.previewByteSize!), bitrateKbps: 128 } } } : {}),
    } }),
  };
}
