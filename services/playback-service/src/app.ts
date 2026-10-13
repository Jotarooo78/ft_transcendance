/** Routes privées de sessions, de progression et d’historique, avec identité JWT et stockage injectables. */
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import client from "prom-client";
import { openInput, pageQuery, PlaybackError, progressInput, uuidPattern, type PageQuery, type Progress, type Session, type SessionPage } from "./session.js";

declare module "fastify" {
  /** Identité du compte vérifiée avant tout accès à ses sessions. */
  interface FastifyRequest {
  /** UUID provenant du JWT vérifié, jamais du corps fourni par le client. */
  authenticatedUserId?: string } }
declare module "@fastify/jwt" {
  /** Sujet du JWT utilisateur attendu par les routes privées d’écoute. */
  interface FastifyJWT {
    /** Données du jeton ou du message, à valider avant leur utilisation. */
    payload: {
    /** Sujet du JWT : UUID du compte, vérifié avant de servir des données privées. */
    sub?: unknown; [claim: string]: unknown };
    /** Informations du JWT décodées et signature vérifiée par le plugin Fastify. */
    user: {
    /** Sujet du JWT : UUID du compte, vérifié avant de servir des données privées. */
    sub?: unknown; [claim: string]: unknown } }
}
/**
 * Lecture Catalogue et opérations de session injectées ; toutes les lectures et écritures privées
 * reçoivent le compte authentifié.
 */
type Options = {
  /** Secret serveur pour vérifier ou signer les JWT ; ne doit pas être envoyé au navigateur. */
  jwtSecret: string;
  /** Lit la durée d’un morceau publié pour ouvrir sa session d’écoute. */
  readTrackDuration: (trackId: string) => Promise<number | null>;
  /** Crée une session d’écoute pour le propriétaire vérifié. */
  createSession: (owner: string, trackId: string, duration: number) => Promise<Session>;
  /** Enregistre la progression sous le verrou de la session du propriétaire. */
  progressSession?: (owner: string, id: string, input: Progress) => Promise<Session>;
  /** Ferme la session du propriétaire sans ajouter de temps écouté. */
  closeSession?: (owner: string, id: string) => Promise<Session>;
  /** Liste privée paginée de l’historique du compte. */
  readSessions?: (owner: string, query: PageQuery) => Promise<SessionPage>;
  /** Contrôle de disponibilité du stockage avant réponse de /ready. */
  ready: () => Promise<void>;
    /** Libération des ressources à la fermeture, ou clôture de la session dans le transport Playback. */
    close?: () => Promise<void>;
    /** Active ou désactive les journaux du serveur construit. */
    logger?: boolean };

/**
 * Construit les routes d’écoute et leurs validations sans ouvrir de port ; les erreurs métier sont
 * exposées avec leur statut, les pannes restent des erreurs de service.
 */
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
  /** Vérifie le JWT et son sujet UUID ; refuse le jeton avant tout accès aux données privées. */
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
  app.put<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/sessions/:id/progress", { onRequest: authenticate }, async (request, reply) => {
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
  app.post<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/sessions/:id/close", { onRequest: authenticate }, async (request, reply) => {
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
  app.get<{
    /** Paramètres de recherche HTTP, validés avant leur conversion. */
    Querystring: Record<string, unknown> }>("/sessions", { onRequest: authenticate }, async (request, reply) => {
    const query = pageQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.readSessions) throw new Error("Missing history reader");
      return await options.readSessions(request.authenticatedUserId!, query);
    } catch { return reply.code(503).send({ error: "playback_unavailable" }); }
  });
  app.addHook("onClose", async () => { registry.clear(); await options.close?.(); });
  return app;
}
