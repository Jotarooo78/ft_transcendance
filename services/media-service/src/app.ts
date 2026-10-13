/** Assemble les routes publiques audio et les opérations privées de fichiers ; leurs autorisations sont distinctes. */
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import client from "prom-client";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { FileStore, FileReader, FileDeletion } from "./file-definitions.js";
import { registerFileUpload } from "./register-file-upload.js";
import { registerFileReads } from "./register-file-reads.js";
import { registerFileDeletion } from "./register-file-deletion.js";

/** Métadonnées requises pour servir un original audio ready et référencé par un morceau publié. */
export type AudioAsset = {
  /** Usage interne Media ; audio et cover représentent les uploads gérés ici. */
  purpose: string;
    /** État de stockage Media : ready pour l’accès, deleting pendant la suppression, deleted après confirmation. */
    state: string;
    /** Nom interne du fichier sur le volume durable ; ne doit pas être exposé au client. */
    storageKey: string;
    /** Type MIME du contenu vérifié, utilisé pour servir les octets avec leur format. */
    mimeType: string;
    /** Taille exacte de l’original ou de la variante en octets, pas en mégaoctets. */
    byteSize: bigint | null;
};
/** Contrôle syntaxique UUID avant accès au stockage. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Formats des originaux audio que cette route publique sait servir ; distincts des formats décodables
 * lors d’un upload privé.
 */
const mimeTypes = new Set(["audio/wav", "audio/mpeg", "audio/ogg", "audio/mp4", "audio/webm"]);

/**
 * Interprète une seule plage bytes avec bornes inclusives, ouverte ou suffixe. Limite la fin à la
 * taille du fichier et renvoie null pour une plage invalide.
 */
function byteRange(value: string, size: number): {
  /** Premier octet de la plage, borne incluse. */
  start: number;
  /** Dernier octet de la plage, borne incluse. */
  end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = Number(match[1]); const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  if (!match[1]) return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null;
  const end = match[2] ? Math.min(last, size - 1) : size - 1;
  return first < size && first <= end ? { start: first, end } : null;
}
/** Lecteurs Catalogue/Media, dossier durable et opérations privées injectables, avec JWT obligatoire. */
type Options = {
  /** Secret serveur pour vérifier ou signer les JWT ; ne doit pas être envoyé au navigateur. */
  jwtSecret: string;
  /** Lecture des métadonnées de l’original audio pour la diffusion publique. */
  readAsset: (id: string) => Promise<AudioAsset | null>;
  /** Contrôle Catalogue avant de diffuser l’audio publiquement. */
  isPublished: (id: string) => Promise<boolean>;
  /** Dossier du volume durable Media ; les chemins publics ne doivent pas le révéler. */
  storageDir: string;
    /** Contrôle de disponibilité du stockage avant réponse de /ready. */
    ready: () => Promise<void>;
    /** Libération des ressources à la fermeture, ou clôture de la session dans le transport Playback. */
    close?: () => Promise<void>;
    /** Active ou désactive les journaux du serveur construit. */
    logger?: boolean;
  /** Opérations d’enregistrement de fichiers injectées dans l’application. */
  files?: FileStore;
  /** Lecture privée et liste des fichiers injectées dans l’application. */
  fileReads?: FileReader;
  /** Suppression privée et contrôle de références injectés dans l’application. */
  fileDeletes?: FileDeletion;
};

/**
 * Construit Media sans ouvrir de port. L’audio public exige une référence publiée ; les uploads,
 * listes, aperçus et suppressions exigent le compte vérifié.
 */
export function buildApp(options: Options) {
  if (!options.jwtSecret.trim()) throw new Error("JWT_SECRET is required");
  const app = Fastify({ logger: options.logger ?? false, exposeHeadRoutes: false });
  app.register(jwt, { secret: options.jwtSecret, verify: { algorithms: ["HS256"] } });
  app.register(multipart);
  app.decorateRequest("authenticatedUserId", undefined);
  if (options.files) registerFileUpload(app, options.storageDir, options.files);
  if (options.fileReads) registerFileReads(app, options.storageDir, options.fileReads);
  if (options.fileDeletes) registerFileDeletion(app, options.storageDir, options.fileDeletes);
  const registry = new client.Registry();
  client.collectDefaultMetrics({ prefix: "media_service_", register: registry });
  app.get("/health", async () => ({ status: "ok", service: "media-service" }));
  app.get("/ready", async (_request, reply) => {
    try { await options.ready(); return { status: "ready", service: "media-service" }; }
    catch { return reply.code(503).send({ status: "not-ready", service: "media-service" }); }
  });
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", registry.contentType); return registry.metrics();
  });
  app.route<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>({ method: ["GET", "HEAD"], url: "/assets/:id/audio",
    /** Sert un original audio publié, régulier et de taille conforme. GET accepte une plage unique avec 206 ; HEAD reste sans corps et une plage invalide produit 416. */
    handler: async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    /** Renvoie une erreur publique, en omettant le corps pour HEAD. */
    const refuse = (status: number, error: string) => reply.code(status).send(request.method === "HEAD" ? undefined : { error });
    if (!uuid.test(request.params.id)) return refuse(400, "invalid_request");
    let file: FileHandle | undefined;
    try {
      const id = request.params.id.toLowerCase();
      const asset = await options.readAsset(id);
      if (!asset || asset.purpose !== "audio" || asset.state !== "ready" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(asset.storageKey) ||
        !mimeTypes.has(asset.mimeType) || asset.byteSize === null ||
        asset.byteSize <= 0n || asset.byteSize > BigInt(Number.MAX_SAFE_INTEGER)) {
        return refuse(404, "media_not_found");
      }
      if (!await options.isPublished(id)) return refuse(404, "media_not_found");
      // NONBLOCK prevents a FIFO from hanging open before fstat.
      file = await open(join(options.storageDir, asset.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== Number(asset.byteSize)) {
        return refuse(404, "media_not_found");
      }
      let portion: {
        /** Premier octet de la plage, borne incluse. */
        start: number;
        /** Dernier octet de la plage, borne incluse. */
        end: number } | undefined;
      if (request.method === "GET" && request.headers.range !== undefined) {
        const range = byteRange(request.headers.range, stat.size);
        if (!range) return reply.code(416).header("Content-Range", `bytes */${stat.size}`).send({ error: "invalid_range" });
        portion = range;
        reply.code(206).header("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
      }
      reply.header("Content-Type", asset.mimeType).header("Content-Length", portion ? portion.end - portion.start + 1 : stat.size)
        .header("Accept-Ranges", "bytes");
      if (request.method === "HEAD") return reply.send();
      const stream = file.createReadStream(portion);
      file = undefined;
      reply.raw.on("close", () => stream.destroy());
      return reply.send(stream);
    } catch (error) {
      const missing = ["ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "");
      return refuse(missing ? 404 : 503, missing ? "media_not_found" : "media_unavailable");
    } finally { await file?.close(); }
  } });
  app.addHook("onClose", async () => { registry.clear(); await options.close?.(); });
  return app;
}
