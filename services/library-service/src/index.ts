import { buildApp } from "./app.js";
import { toPlaylist } from "./playlist.js";
import { catalogReader } from "./catalog.js";
import { addItem, removeItem, updatePlaylist } from "./database/mutations.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";

const app = buildApp({
  jwtSecret: process.env.JWT_SECRET ?? "",
  logger: true,
  ready: async () => { await prisma.$queryRaw`SELECT 1`; },
  close: disconnectPrisma,
  isTrackPublished: catalogReader(process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4002"),
  addItem,
  removeItem,
  updatePlaylist,
  createPlaylist: async (ownerUserId, input) => toPlaylist(await prisma.playlist.create({
    data: { ...input, ownerUserId, visibility: "private", version: 1n }, include: { items: true },
  })),
  readPlaylist: async (ownerUserId, id) => {
    const row = await prisma.playlist.findFirst({ where: { id, ownerUserId, visibility: "private" },
      include: { items: { orderBy: { position: "asc" } } } });
    return row ? toPlaylist(row) : null;
  },
  readPlaylists: async (ownerUserId, query) => {
    const where = { ownerUserId, visibility: "private" };
    const [rows, total] = await prisma.$transaction([
      prisma.playlist.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { items: { orderBy: { position: "asc" } } } }),
      prisma.playlist.count({ where }),
    ], { isolationLevel: "RepeatableRead" });
    return { ...query, total, items: rows.map(toPlaylist) };
  },
});

await app.listen({ port: Number(process.env.PORT ?? 4004), host: "0.0.0.0" });
