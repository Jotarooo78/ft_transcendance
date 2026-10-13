import { buildApp } from "./app.js";
import { publicationReader } from "./publication.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";
import { fileStore } from "./database/save-file-record.js";
import { recoverUploads } from "./save-file.js";
import { fileReader } from "./database/list-files.js";
import { fileDeletion } from "./database/mark-file-deleted.js";
import { catalogReferences } from "./check-catalog-references.js";
import { recoverDeletions } from "./delete-file.js";

const storageDir = process.env.MEDIA_STORAGE_DIR ?? "/data/audio";
const files = fileStore(prisma);
const catalogUrl = process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4002";
const fileDeletes = fileDeletion(prisma, catalogReferences(catalogUrl, process.env.INTERNAL_SERVICE_TOKEN ?? ""));
await recoverUploads(storageDir, files);
await recoverDeletions(storageDir, fileDeletes);

const app = buildApp({
  jwtSecret: process.env.JWT_SECRET ?? "",
  logger: true,
  storageDir,
  files,
  fileReads: fileReader(prisma),
  fileDeletes,
  readAsset: id => prisma.asset.findUnique({ where: { id } }),
  isPublished: publicationReader(catalogUrl),
  ready: async () => { await prisma.$queryRaw`SELECT 1`; },
  close: disconnectPrisma,
});

await app.listen({ port: Number(process.env.PORT ?? 4003), host: "0.0.0.0" });
