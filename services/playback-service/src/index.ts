import { buildApp } from "./app.js";
import { catalogReader } from "./catalog.js";
import { toSession } from "./session.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");
const app = buildApp({ jwtSecret: secret, logger: true,
  readTrackDuration: catalogReader(process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4002"),
  createSession: async (owner, trackId, duration) => toSession(await prisma.session.create({
    data: { userId: owner, trackId, trackDurationMs: BigInt(duration) },
  })),
  ready: async () => { await prisma.$queryRaw`SELECT 1`; }, close: disconnectPrisma,
});

await app.listen({ port: Number(process.env.PORT ?? 4005), host: "0.0.0.0" });
