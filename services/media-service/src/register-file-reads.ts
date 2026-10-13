import type { FastifyInstance } from "fastify";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { authenticateUser, uuidPattern } from "./authenticate-user.js";
import type { FileReader } from "./file-definitions.js";
import { publicFile } from "./file-definitions.js";
import { audioByteLimit, imageByteLimit } from "./validate-file.js";

export function registerFileReads(app: FastifyInstance, storageDir: string, files: FileReader) {
  app.get<{ Querystring: Record<string, unknown> }>("/assets", { onRequest: authenticateUser }, async (request, reply) => {
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
  app.route<{ Params: { id: string } }>({ method: ["GET", "HEAD"], url: "/assets/:id/private-content", onRequest: authenticateUser,
    handler: async (request, reply) => {
      const refuse = (status: number, error: string) => reply.code(status).send(request.method === "HEAD" ? undefined : { error, message: "Aperçu indisponible." });
      if (!uuidPattern.test(request.params.id)) return refuse(400, "invalid_request");
      let handle: FileHandle | undefined;
      try {
        const asset = await files.read(request, request.params.id.toLowerCase());
        if (!asset || asset.uploaderUserId !== request.authenticatedUserId || asset.state !== "ready" || !["audio", "cover"].includes(asset.purpose)) return refuse(404, "file_not_found");
        const content = asset.purpose === "audio" ? asset.variants[0] : asset;
        if (!content || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(content.storageKey) || content.byteSize === null || content.byteSize <= 0n ||
          content.byteSize > BigInt(asset.purpose === "audio" ? audioByteLimit : imageByteLimit) ||
          !(asset.purpose === "audio" ? content.mimeType === "audio/mpeg" : ["image/png", "image/jpeg", "image/webp"].includes(content.mimeType))) return refuse(404, "file_not_found");
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
