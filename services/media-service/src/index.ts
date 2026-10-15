/** Assemble Prisma et Catalogue, reprend uploads et suppressions interrompus avant d’accepter les requêtes. */
import { registerPublicationReservation } from "./reserve-publication.js";
import { registerPublicArtwork } from "./read-public-artwork.js";
import { expireUploads } from "./expire-uploads.js";
import { buildApp } from "./app.js";
import { publicationReader } from "./publication.js";
import { disconnectPrisma, prisma } from "./database/prisma.js";
import { fileStore } from "./database/save-file-record.js";
import { recoverUploads } from "./save-file.js";
import { fileReader } from "./database/list-files.js";
import { fileDeletion } from "./database/mark-file-deleted.js";
import { catalogReferences } from "./check-catalog-references.js";
import { recoverDeletions } from "./delete-file.js";
import { coverStore } from "./database/save-audio-cover.js";
import { recoverCoverUploads, cleanRetiredCovers } from "./save-audio-cover.js";

/** Dossier du volume durable Media ; les chemins publics ne doivent pas le révéler. */
const storageDir = process.env.MEDIA_STORAGE_DIR ?? "/data/audio";
/** Opérations d’enregistrement de fichiers injectées dans l’application. */
const files = fileStore(prisma);
const catalogUrl = process.env.CATALOG_SERVICE_URL ?? "http://catalog-service:4002";
/** Suppression privée et contrôle de références injectés dans l’application. */
const fileDeletes = fileDeletion(prisma, catalogReferences(catalogUrl, process.env.INTERNAL_SERVICE_TOKEN ?? ""));
await recoverUploads(storageDir, files);
/** Pochettes rattachées à un audio ; leurs traces de stockage sont reprises avant les suppressions. */
const fileCovers = coverStore(prisma);
await recoverCoverUploads(storageDir, fileCovers);
await cleanRetiredCovers(storageDir, fileCovers);
await recoverDeletions(storageDir, fileDeletes);

/**
 * Application HTTP assemblée avec ses lecteurs et écrivains ; l’ouverture du port est effectuée
 * séparément.
 */
const app = buildApp({
  jwtSecret: process.env.JWT_SECRET ?? "",
  logger: true,
  storageDir,
  files,
  fileCovers,
  fileReads: fileReader(prisma),
  fileDeletes,
  /** Lit les métadonnées nécessaires à la route audio publique depuis le schéma Media. */
  readAsset: async id => {
    const asset = await prisma.asset.findUnique({ where: { id }, include: { variants: { where: { renditionKey: "private-preview" } } } });
    const preview = asset?.variants[0];
    return asset && preview ? { ...asset, storageKey: preview.storageKey, mimeType: preview.mimeType, byteSize: preview.byteSize } : asset;
  },
  isPublished: publicationReader(catalogUrl),
  /** Vérifie PostgreSQL avant de déclarer Media disponible. */
  ready: async () => { await prisma.$queryRaw`SELECT 1`; },
  close: disconnectPrisma,
});

registerPublicationReservation(app, prisma, process.env.INTERNAL_SERVICE_TOKEN ?? "");
registerPublicArtwork(app, prisma, storageDir, publicationReader(catalogUrl));
/** Nettoyage périodique sans chevauchement ; une indisponibilité Catalogue conserve les fichiers. */
let cleaning = false;
const cleanupTimer = setInterval(async () => {
  if (cleaning) return;
  cleaning = true;
  try { await expireUploads(prisma, fileDeletes, storageDir); }
  catch (error) { app.log.error(error, "Upload expiration deferred"); }
  finally { cleaning = false; }
}, 60_000);
cleanupTimer.unref();
app.addHook("onClose", async () => { clearInterval(cleanupTimer); });
await app.listen({ port: Number(process.env.PORT ?? 4003), host: "0.0.0.0" });
