/** Branche Playback sur son schéma PostgreSQL et sur la durée publiée dans Catalogue. */
import { buildApp } from "./app.js";
import { catalogReader } from "./catalog.js";
import { toHistorySession, toSession } from "./session.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";
import { closeSession, progressSession } from "./database/mutations.js";

const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");
/**
 * Application HTTP assemblée avec ses lecteurs et écrivains ; l’ouverture du port est effectuée
 * séparément.
 */
const app = buildApp({ jwtSecret: secret, logger: true,
  progressSession, closeSession,
  readTrackDuration: catalogReader(process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4002"),
  /** Crée une nouvelle session du compte avec la durée Catalogue figée et une progression initiale nulle. */
  createSession: async (owner, trackId, duration) => toSession(await prisma.session.create({
    data: { userId: owner, trackId, trackDurationMs: BigInt(duration) },
  })),
  /**
   * Liste et compte les sessions du propriétaire dans un instantané cohérent ; inclut le dernier
   * événement pour retrouver la position confirmée.
   */
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
  /** Exécute une requête PostgreSQL pour vérifier la disponibilité du service. */
  ready: async () => { await prisma.$queryRaw`SELECT 1`; }, close: disconnectPrisma,
});

await app.listen({ port: Number(process.env.PORT ?? 4005), host: "0.0.0.0" });
