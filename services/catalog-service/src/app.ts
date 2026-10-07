import Fastify from "fastify";
import client from "prom-client";
import { parseTrackQuery, uuidPattern, type TrackDto, type TrackList, type TrackQuery } from "./catalog.js";

type Options = {
  readTrack: (id: string) => Promise<TrackDto | null>;
  listTracks?: (query: TrackQuery) => Promise<TrackList>;
  ready: () => Promise<void>;
  close?: () => Promise<void>;
  logger?: boolean;
};

export function buildApp(options: Options) {
  const app = Fastify({ logger: options.logger ?? false });
  const registry = new client.Registry();
  client.collectDefaultMetrics({ prefix: "catalog_service_", register: registry });
  app.get("/health", async () => ({ status: "ok", service: "catalog-service" }));
  app.get("/ready", async (_request, reply) => {
    try {
      await options.ready();
      return { status: "ready", service: "catalog-service" };
    } catch {
      return reply.code(503).send({ status: "not-ready", service: "catalog-service" });
    }
  });
  app.get("/metrics", async (_request, reply) => {
    reply.header("Content-Type", registry.contentType);
    return registry.metrics();
  });
  app.get<{ Params: { id: string } }>("/tracks/:id", async (request, reply) => {
    if (!uuidPattern.test(request.params.id)) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    try {
      const track = await options.readTrack(request.params.id.toLowerCase());
      if (!track) return reply.code(404).send({ error: "track_not_found" });
      return track;
    } catch {
      return reply.code(503).send({ error: "catalog_unavailable" });
    }
  });
  app.get<{ Querystring: Record<string, unknown> }>("/tracks", async (request, reply) => {
    const query = parseTrackQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.listTracks) throw new Error("Missing catalogue list reader");
      return await options.listTracks(query);
    } catch {
      return reply.code(503).send({ error: "catalog_unavailable" });
    }
  });
  app.addHook("onClose", async () => {
    registry.clear();
    await options.close?.();
  });
  return app;
}
