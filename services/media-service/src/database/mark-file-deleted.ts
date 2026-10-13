/** Transitions Prisma de suppression filtrées par propriétaire ; les octets sont retirés entre deleting et deleted. */
import type { PrismaClient } from "../generated/prisma/client.js";
import type { FileDeletion } from "../file-definitions.js";
import { readOwnedAsset } from "../read-owned-asset.js";

/** Construit les opérations SQL et associe le contrôle Catalogue injecté pour la suppression. */
export function fileDeletion(database: Pick<PrismaClient, "asset" | "variant">, referenced: FileDeletion["referenced"]): FileDeletion {
  return {
    referenced,
    /** Lit le fichier détenu par le compte puis toutes ses variantes pour pouvoir les supprimer ensemble. */
    read: async (request, id) => {
      const asset = await readOwnedAsset(database, request, id);
      return asset ? { ...asset, variants: await database.variant.findMany({ where: { assetId: asset.id } }) } : null;
    },
    /** Passe ready à deleting pour ce propriétaire ; renvoie si une ligne a effectivement changé. */
    markDeleting: async (id, uploaderUserId) => (await database.asset.updateMany({ where: { id, uploaderUserId, state: "ready" }, data: { state: "deleting" } })).count === 1,
    /** Confirme deleted seulement pour le fichier deleting du propriétaire. */
    markDeleted: async (id, uploaderUserId) => { await database.asset.updateMany({ where: { id, uploaderUserId, state: "deleting" }, data: { state: "deleted" } }); },
    /**
     * Lit un lot borné de fichiers deleting ayant un propriétaire, afin de reprendre les suppressions au
     * démarrage.
     */
    pending: maximum => database.asset.findMany({ where: { state: "deleting", uploaderUserId: { not: null } }, orderBy: { id: "asc" }, take: maximum }),
  };
}
