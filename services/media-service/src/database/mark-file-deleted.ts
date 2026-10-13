import type { PrismaClient } from "../generated/prisma/client.js";
import type { FileDeletion } from "../file-definitions.js";
import { readOwnedAsset } from "../read-owned-asset.js";

export function fileDeletion(database: Pick<PrismaClient, "asset" | "variant">, referenced: FileDeletion["referenced"]): FileDeletion {
  return {
    referenced,
    read: async (request, id) => {
      const asset = await readOwnedAsset(database, request, id);
      return asset ? { ...asset, variants: await database.variant.findMany({ where: { assetId: asset.id } }) } : null;
    },
    markDeleting: async (id, uploaderUserId) => (await database.asset.updateMany({ where: { id, uploaderUserId, state: "ready" }, data: { state: "deleting" } })).count === 1,
    markDeleted: async (id, uploaderUserId) => { await database.asset.updateMany({ where: { id, uploaderUserId, state: "deleting" }, data: { state: "deleted" } }); },
    pending: maximum => database.asset.findMany({ where: { state: "deleting", uploaderUserId: { not: null } }, orderBy: { id: "asc" }, take: maximum }),
  };
}
