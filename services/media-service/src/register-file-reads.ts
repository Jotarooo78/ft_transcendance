/** Liste et aperçus des fichiers privés du compte ; aucune clé de stockage n’est exposée au navigateur. */
import type { FastifyInstance } from "fastify";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { authenticateUser, uuidPattern } from "./authenticate-user.js";
import type { FileReader } from "./file-definitions.js";
import { publicFile } from "./file-definitions.js";
import { audioByteLimit, imageByteLimit } from "./validate-file.js";

/**
 * Ajoute la liste paginée et les lectures GET/HEAD privées. Vérifie propriétaire, état ready, chemin
 * simple, fichier régulier et taille exacte ; sert l’image originale ou l’aperçu MP3 de l’audio.
 */
export function registerFileReads(app: FastifyInstance, storageDir: string, files: FileReader) {
  app.get<{
    /** Paramètres de recherche HTTP, validés avant leur conversion. */
    Querystring: Record<string, unknown> }>("/assets", { onRequest: authenticateUser }, async (request, reply) => {
    const { page = "1", pageSize = "50" } = request.query;
    if (Object.keys(request.query).some(key => key !== "page" && key !== "pageSize") ||
      typeof page !== "string" || !/^[1-9]\d{0,3}$/.test(page) || typeof pageSize !== "string" || !/^[1-9]\d{0,2}$/.test(pageSize) || Number(pageSize) > 100) {
      return reply.code(400).send({ error: "invalid_request", message: "Pagination invalide." });
    }
    try {
      const data = await files.list(request.authenticatedUserId!, Number(page), Number(pageSize));
      return { items: data.items.map(publicFile), total: data.total, page: Number(page), pageSize: Number(pageSize) };
    } catch { return reply.code(503).send({ error: "files_unavailable", message: "Impossible de charger vos fichiers. Réessayez." }); }
  });
  app.route<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string; content: string } }>({ method: ["GET", "HEAD"], url: "/assets/:id/:content", onRequest: authenticateUser,
    /**
     * Lit uniquement l’aperçu du propriétaire vérifié. HEAD renvoie les mêmes métadonnées sans corps ; une
     * fermeture de connexion arrête le flux.
     */
    handler: async (request, reply) => {
      /**
       * Construit un refus sans corps pour HEAD et avec message public pour GET, sans révéler un fichier
       * d’un autre compte.
       */
      const refuse = (status: number, error: string) => reply.code(status).send(request.method === "HEAD" ? undefined : { error, message: "Aperçu indisponible." });
      const target = request.params.content;
      if (target !== "private-content" && target !== "cover") return refuse(404, "file_not_found");
      if (!uuidPattern.test(request.params.id)) return refuse(400, "invalid_request");
      let handle: FileHandle | undefined;
      try {
        const asset = await files.read(request, request.params.id.toLowerCase());
        if (!asset || asset.uploaderUserId !== request.authenticatedUserId || asset.state !== "ready" || !["audio", "cover"].includes(asset.purpose)) return refuse(404, "file_not_found");
        const image = target === "cover" || asset.purpose !== "audio";
        const content = target === "cover" ? asset.variants.find(variant => variant.renditionKey === "cover") :
          asset.purpose === "audio" ? asset.variants.find(variant => variant.renditionKey === "private-preview") : asset;
        if (!content || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(content.storageKey) || content.byteSize === null || content.byteSize <= 0n ||
          content.byteSize > BigInt(image ? imageByteLimit : audioByteLimit) ||
          !(image ? ["image/png", "image/jpeg", "image/webp"].includes(content.mimeType) : content.mimeType === "audio/mpeg")) return refuse(404, "file_not_found");
        handle = await open(join(storageDir, content.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== Number(content.byteSize)) return refuse(404, "file_not_found");
        reply.header("Content-Type", content.mimeType).header("Content-Length", stat.size).header("X-Content-Type-Options", "nosniff");
        if (request.method === "HEAD") return reply.send();
        const stream = handle.createReadStream(); handle = undefined;
        reply.raw.on("close", () => stream.destroy()); return reply.send(stream);
      } catch (error) {
        const missing = ["ENOENT", "ELOOP", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "");
        return refuse(missing ? 404 : 503, missing ? "file_not_found" : "files_unavailable");
      } finally { await handle?.close(); }
    },
  });
}
