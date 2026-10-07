import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import client from "prom-client";
import { pageQuery, uuidPattern, type PageQuery, type Playlist, type PlaylistPage } from "./playlist.js";

declare module "fastify" { interface FastifyRequest { authenticatedUserId?: string } }
declare module "@fastify/jwt" {
  interface FastifyJWT { payload: { sub?: unknown; [claim: string]: unknown }; user: { sub?: unknown; [claim: string]: unknown } }
}
type Options = {
  jwtSecret: string;
  readPlaylists: (owner: string, query: PageQuery) => Promise<PlaylistPage>;
  readPlaylist: (owner: string, id: string) => Promise<Playlist | null>;
  ready: () => Promise<void>; close?: () => Promise<void>; logger?: boolean;
};

export function buildApp(options: Options) {
  if (!options.jwtSecret) throw new Error("JWT_SECRET is required");
  const app = Fastify({ logger: options.logger ?? false });
  app.register(jwt, { secret: options.jwtSecret });
  const registry = new client.Registry();
  client.collectDefaultMetrics({ prefix: "library_service_", register: registry });
  app.get("/health", async () => ({ status: "ok", service: "library-service" }));
  app.get("/ready", async (_request, reply) => {
    try { await options.ready(); return { status: "ready", service: "library-service" }; }
    catch { return reply.code(503).send({ status: "not-ready", service: "library-service" }); }
  });
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", registry.contentType); return registry.metrics();
  });
  async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    reply.header("Cache-Control", "no-store");
    try {
      await request.jwtVerify();
      if (typeof request.user.sub !== "string" || !uuidPattern.test(request.user.sub)) throw new Error("Invalid subject");
      request.authenticatedUserId = request.user.sub.toLowerCase();
    } catch { return reply.code(401).send({ error: "unauthorized" }); }
  }
  app.get<{ Querystring: Record<string, unknown> }>("/playlists", { onRequest: authenticate }, async (request, reply) => {
    const query = pageQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_request" });
    try { return await options.readPlaylists(request.authenticatedUserId!, query); }
    catch { return reply.code(503).send({ error: "library_unavailable" }); }
  });
  app.get<{ Params: { id: string } }>("/playlists/:id", { onRequest: authenticate }, async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    try {
      const playlist = await options.readPlaylist(request.authenticatedUserId!, request.params.id.toLowerCase());
      if (!playlist) return reply.code(404).send({ error: "playlist_not_found" });
      return playlist;
    } catch { return reply.code(503).send({ error: "library_unavailable" }); }
  });
  app.addHook("onClose", async () => { registry.clear(); await options.close?.(); });
  return app;
}
