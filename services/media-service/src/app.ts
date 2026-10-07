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

function byteRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = Number(match[1]); const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  if (!match[1]) return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null;
  const end = match[2] ? Math.min(last, size - 1) : size - 1;
  return first < size && first <= end ? { start: first, end } : null;
}
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
  app.route<{ Params: { id: string } }>({ method: ["GET", "HEAD"], url: "/assets/:id/audio", handler: async (request, reply) => {
    reply.header("Cache-Control", "no-store");
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
      let portion: { start: number; end: number } | undefined;
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
