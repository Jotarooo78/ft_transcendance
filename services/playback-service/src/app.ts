import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import client from "prom-client";
import { openInput, PlaybackError, progressInput, uuidPattern, type Progress, type Session } from "./session.js";

declare module "fastify" { interface FastifyRequest { authenticatedUserId?: string } }
declare module "@fastify/jwt" {
  interface FastifyJWT { payload: { sub?: unknown; [claim: string]: unknown }; user: { sub?: unknown; [claim: string]: unknown } }
}
type Options = { jwtSecret: string; readTrackDuration: (trackId: string) => Promise<number | null>;
  createSession: (owner: string, trackId: string, duration: number) => Promise<Session>;
  progressSession?: (owner: string, id: string, input: Progress) => Promise<Session>;
  closeSession?: (owner: string, id: string) => Promise<Session>;
  ready: () => Promise<void>; close?: () => Promise<void>; logger?: boolean };

export function buildApp(options: Options) {
  if (!options.jwtSecret) throw new Error("JWT_SECRET is required");
  const app = Fastify({ logger: options.logger ?? false });
  app.register(jwt, { secret: options.jwtSecret });
  const registry = new client.Registry();
  client.collectDefaultMetrics({ prefix: "playback_service_", register: registry });
  app.get("/health", async () => ({ status: "ok", service: "playback-service" }));
  app.get("/ready", async (_request, reply) => {
    try { await options.ready(); return { status: "ready", service: "playback-service" }; }
    catch { return reply.code(503).send({ status: "not-ready", service: "playback-service" }); }
  });
  app.get("/metrics", async (_request, reply) => { reply.header("Content-Type", registry.contentType); return registry.metrics(); });
  async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    reply.header("Cache-Control", "no-store");
    try {
      await request.jwtVerify();
      if (typeof request.user.sub !== "string" || !uuidPattern.test(request.user.sub)) throw new Error("Invalid subject");
      request.authenticatedUserId = request.user.sub.toLowerCase();
    } catch { return reply.code(401).send({ error: "unauthorized" }); }
  }
  app.post("/sessions", { onRequest: authenticate }, async (request, reply) => {
    const trackId = openInput(request.body);
    if (!trackId) return reply.code(400).send({ error: "invalid_request" });
    try {
      const duration = await options.readTrackDuration(trackId);
      if (duration === null) throw new PlaybackError(404, "track_not_found");
      if (!Number.isSafeInteger(duration) || duration <= 0) throw new Error("Invalid track duration");
      return reply.code(201).send(await options.createSession(request.authenticatedUserId!, trackId, duration));
    } catch (error) {
      if (error instanceof PlaybackError) return reply.code(error.status).send({ error: error.code });
      return reply.code(503).send({ error: "playback_unavailable" });
    }
  });
  app.put<{ Params: { id: string } }>("/sessions/:id/progress", { onRequest: authenticate }, async (request, reply) => {
    const input = progressInput(request.body);
    if (!input || !uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.progressSession) throw new Error("Missing progress writer");
      return await options.progressSession(request.authenticatedUserId!, request.params.id.toLowerCase(), input);
    } catch (error) {
      if (error instanceof PlaybackError) return reply.code(error.status).send({ error: error.code });
      return reply.code(503).send({ error: "playback_unavailable" });
    }
  });
  app.post<{ Params: { id: string } }>("/sessions/:id/close", { onRequest: authenticate }, async (request, reply) => {
    if (!uuidPattern.test(request.params.id) || (request.body !== undefined &&
      (!request.body || typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).length !== 0))) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    try {
      if (!options.closeSession) throw new Error("Missing close writer");
      return await options.closeSession(request.authenticatedUserId!, request.params.id.toLowerCase());
    } catch (error) {
      if (error instanceof PlaybackError) return reply.code(error.status).send({ error: error.code });
      return reply.code(503).send({ error: "playback_unavailable" });
    }
  });
  app.addHook("onClose", async () => { registry.clear(); await options.close?.(); });
  return app;
}
