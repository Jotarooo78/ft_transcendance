/** Lecteurs Prisma des fichiers prêts du propriétaire, avec pagination et total cohérents. */
import type { PrismaClient } from "../generated/prisma/client.js";
import type { FileReader } from "../file-definitions.js";
import { readOwnedAsset } from "../read-owned-asset.js";

/**
 * Construit la lecture privée et la liste ready audio/cover ; le tri récent utilise l’UUID comme
 * départage stable.
 */
export function fileReader(database: Pick<PrismaClient, "asset">): FileReader {
  return {
    /** Applique la lecture SQL filtrée par authenticatedUserId avant de renvoyer l’original et l’aperçu. */
    read: (request, id) => readOwnedAsset(database, request, id),
    /**
     * Liste et compte les fichiers ready du compte dans un instantané PostgreSQL cohérent, avec page et
     * taille fournies.
     */
    list: async (uploaderUserId, page, pageSize) => {
      const where = { uploaderUserId, state: "ready", purpose: { in: ["audio", "cover"] } };
      const [items, total] = await Promise.all([
        database.asset.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: pageSize, skip: (page - 1) * pageSize }),
        database.asset.count({ where }),
      ]);
      return { items, total };
    },
  };
}
