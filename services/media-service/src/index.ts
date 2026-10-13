import { buildApp } from "./app.js";
import { publicationReader } from "./publication.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";
import { fileStore } from "./database/save-file-record.js";
import { recoverUploads } from "./save-file.js";

const storageDir = process.env.MEDIA_STORAGE_DIR ?? "/data/audio";
const files = fileStore(prisma);
await recoverUploads(storageDir, files);

const app = buildApp({
  jwtSecret: process.env.JWT_SECRET ?? "",
  logger: true,
  storageDir,
  files,
  readAsset: id => prisma.asset.findUnique({ where: { id } }),
  isPublished: publicationReader(process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4002"),
  ready: async () => { await prisma.$queryRaw`SELECT 1`; },
  close: disconnectPrisma,
});

await app.listen({ port: Number(process.env.PORT ?? 4003), host: "0.0.0.0" });
