import type { PrismaClient } from "../generated/prisma/client.js";
import type { FileReader } from "../file-definitions.js";
import { readOwnedAsset } from "../read-owned-asset.js";

export function fileReader(database: Pick<PrismaClient, "asset">): FileReader {
  return {
    read: (request, id) => readOwnedAsset(database, request, id),
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
