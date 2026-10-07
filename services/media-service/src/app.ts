import Fastify from "fastify";
import client from "prom-client";
import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

export type AudioAsset = {
  purpose: string; state: string; storageKey: string; mimeType: string; byteSize: bigint | null;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mimeTypes = new Set(["audio/wav", "audio/mpeg", "audio/ogg", "audio/mp4", "audio/webm"]);
type Options = {
  readAsset: (id: string) => Promise<AudioAsset | null>;
  isPublished: (id: string) => Promise<boolean>;
  storageDir: string; ready: () => Promise<void>; close?: () => Promise<void>; logger?: boolean;
};

export function buildApp(options: Options) {
  const app = Fastify({ logger: options.logger ?? false, exposeHeadRoutes: false });
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
  app.get<{ Params: { id: string } }>("/assets/:id/audio", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!uuid.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    let file: FileHandle | undefined;
    try {
      const id = request.params.id.toLowerCase();
      const asset = await options.readAsset(id);
      if (!asset || asset.purpose !== "audio" || asset.state !== "ready" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(asset.storageKey) ||
        !mimeTypes.has(asset.mimeType) || asset.byteSize === null ||
        asset.byteSize <= 0n || asset.byteSize > BigInt(Number.MAX_SAFE_INTEGER)) {
        return reply.code(404).send({ error: "media_not_found" });
      }
      if (!await options.isPublished(id)) return reply.code(404).send({ error: "media_not_found" });
      // NONBLOCK prevents a FIFO from hanging open before fstat.
      file = await open(join(options.storageDir, asset.storageKey), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const stat = await file.stat();
      if (!stat.isFile() || stat.size !== Number(asset.byteSize)) {
        return reply.code(404).send({ error: "media_not_found" });
      }
      reply.header("Content-Type", asset.mimeType).header("Content-Length", stat.size)
        .header("Accept-Ranges", "bytes");
      const stream = file.createReadStream();
      file = undefined;
      reply.raw.on("close", () => stream.destroy());
      return reply.send(stream);
    } catch (error) {
      const missing = ["ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "");
      return reply.code(missing ? 404 : 503).send({ error: missing ? "media_not_found" : "media_unavailable" });
    } finally { await file?.close(); }
  });
  app.addHook("onClose", async () => { registry.clear(); await options.close?.(); });
  return app;
}
