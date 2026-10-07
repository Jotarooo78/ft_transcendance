import { buildApp } from "./app.js";
import { catalogReader } from "./catalog.js";
import { toHistorySession, toSession } from "./session.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";
import { closeSession, progressSession } from "./database/mutations.js";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");
const app = buildApp({ jwtSecret: secret, logger: true,
  progressSession, closeSession,
  readTrackDuration: catalogReader(process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4002"),
  createSession: async (owner, trackId, duration) => toSession(await prisma.session.create({
    data: { userId: owner, trackId, trackDurationMs: BigInt(duration) },
  })),
  readSessions: (owner, query) => prisma.$transaction(async tx => {
    const where = { userId: owner };
    const [total, rows] = await Promise.all([
      tx.session.count({ where }),
      tx.session.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "asc" }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        include: { events: { orderBy: { sequence: "desc" }, take: 1 } } }),
    ]);
    return { ...query, total, items: rows.map(toHistorySession) };
  }, { isolationLevel: "RepeatableRead" }),
  ready: async () => { await prisma.$queryRaw`SELECT 1`; }, close: disconnectPrisma,
});

await app.listen({ port: Number(process.env.PORT ?? 4005), host: "0.0.0.0" });
