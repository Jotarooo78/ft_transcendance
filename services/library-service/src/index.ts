import { buildApp } from "./app.js";
import { toPlaylist } from "./playlist.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";

const app = buildApp({
  jwtSecret: process.env.JWT_SECRET ?? "",
  logger: true,
  ready: async () => { await prisma.$queryRaw`SELECT 1`; },
  close: disconnectPrisma,
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
