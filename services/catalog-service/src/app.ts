/** Routes de lecture du Catalogue et contrôle interne des références utilisé avant une suppression Media. */
import Fastify from "fastify";
import client from "prom-client";
import { timingSafeEqual } from "node:crypto";
import { parseTrackQuery, uuidPattern, type TrackDto, type TrackList, type TrackQuery } from "./catalog.js";

/**
 * Lecteurs injectés pour les routes ; les références privées exigent un token interne. ready contrôle
 * PostgreSQL et close libère les ressources.
 */
type Options = {
  /** Lecture d’un morceau publié ; une absence reste null. */
  readTrack: (id: string) => Promise<TrackDto | null>;
  /** Lecture filtrée et paginée des morceaux publiés. */
  listTracks?: (query: TrackQuery) => Promise<TrackList>;
  /** Vérifie qu’un morceau publié utilise cet audio. */
  isAssetPublished?: (id: string) => Promise<boolean>;
  /** Vérifie toute référence audio, couverture ou artiste, y compris en brouillon. */
  isAssetReferenced?: (id: string) => Promise<boolean>;
  /** Secret partagé entre services pour les routes internes ; distinct du JWT utilisateur. */
  internalServiceToken?: string;
  /** Contrôle de disponibilité du stockage avant réponse de /ready. */
  ready: () => Promise<void>;
  /** Libération des ressources à la fermeture, ou clôture de la session dans le transport Playback. */
  close?: () => Promise<void>;
  /** Active ou désactive les journaux du serveur construit. */
  logger?: boolean;
};

/**
 * Construit les lectures publiques, la disponibilité et les métriques. La route interne de références
 * vérifie le secret ; une panne de lecteur devient 503 sans divulguer les détails SQL.
 */
export function buildApp(options: Options) {
  if (options.isAssetReferenced && !options.internalServiceToken?.trim()) throw new Error("INTERNAL_SERVICE_TOKEN is required");
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
  app.get<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/tracks/:id", async (request, reply) => {
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
  app.get<{
    /** Paramètres de recherche HTTP, validés avant leur conversion. */
    Querystring: Record<string, unknown> }>("/tracks", async (request, reply) => {
    const query = parseTrackQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.listTracks) throw new Error("Missing catalogue list reader");
      return await options.listTracks(query);
    } catch {
      return reply.code(503).send({ error: "catalog_unavailable" });
    }
  });
  app.get<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/assets/:id/publication", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.isAssetPublished) throw new Error("Missing publication reader");
      return { published: await options.isAssetPublished(request.params.id.toLowerCase()) };
    } catch { return reply.code(503).send({ error: "catalog_unavailable" }); }
  });
  app.get<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/internal/assets/:id/references", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const received = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${options.internalServiceToken ?? ""}`);
    if (!options.internalServiceToken || received.length !== expected.length || !timingSafeEqual(received, expected)) return reply.code(401).send({ error: "unauthorized" });
    if (!uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.isAssetReferenced) throw new Error("Missing references reader");
      return { referenced: await options.isAssetReferenced(request.params.id.toLowerCase()) };
    } catch { return reply.code(503).send({ error: "catalog_unavailable" }); }
  });
  app.addHook("onClose", async () => {
    registry.clear();
    await options.close?.();
  });
  return app;
}
