import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import client from "prom-client";
import { addItemInput, createInput, pageQuery, PlaylistError, uuidPattern, type PageQuery, type Playlist, type PlaylistInput, type PlaylistPage } from "./playlist.js";

declare module "fastify" { interface FastifyRequest { authenticatedUserId?: string } }
declare module "@fastify/jwt" {
  interface FastifyJWT { payload: { sub?: unknown; [claim: string]: unknown }; user: { sub?: unknown; [claim: string]: unknown } }
}
type Options = {
  jwtSecret: string;
  readPlaylists: (owner: string, query: PageQuery) => Promise<PlaylistPage>;
  readPlaylist: (owner: string, id: string) => Promise<Playlist | null>;
  createPlaylist?: (owner: string, input: PlaylistInput) => Promise<Playlist>;
  isTrackPublished?: (trackId: string) => Promise<boolean>;
  addItem?: (owner: string, id: string, trackId: string, expectedVersion: number) => Promise<Playlist>;
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
  app.post("/playlists", { onRequest: authenticate }, async (request, reply) => {
    const input = createInput(request.body);
    if (!input) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.createPlaylist) throw new Error("Missing playlist writer");
      return reply.code(201).send(await options.createPlaylist(request.authenticatedUserId!, input));
    } catch { return reply.code(503).send({ error: "library_unavailable" }); }
  });
  app.post<{ Params: { id: string } }>("/playlists/:id/items", { onRequest: authenticate }, async (request, reply) => {
    const input = addItemInput(request.body);
    if (!input || !uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    try {
      const owner = request.authenticatedUserId!, id = request.params.id.toLowerCase();
      const current = await options.readPlaylist(owner, id);
      if (!current) throw new PlaylistError(404, "playlist_not_found");
      if (current.version !== input.expectedVersion) throw new PlaylistError(409, "version_conflict");
      if (!options.isTrackPublished || !options.addItem) throw new Error("Missing add dependencies");
      if (!await options.isTrackPublished(input.trackId)) throw new PlaylistError(404, "track_not_found");
      return await options.addItem(owner, id, input.trackId, input.expectedVersion);
    } catch (error) {
      if (error instanceof PlaylistError) return reply.code(error.status).send({ error: error.code });
      return reply.code(503).send({ error: "library_unavailable" });
    }
  });
  app.addHook("onClose", async () => { registry.clear(); await options.close?.(); });
  return app;
}
