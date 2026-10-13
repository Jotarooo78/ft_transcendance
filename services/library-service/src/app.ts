/** Routes JWT de playlists privées avec validation d’entrée et opérations de stockage injectables. */
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import client from "prom-client";
import { addItemInput, createInput, editInput, pageQuery, PlaylistError, uuidPattern, versionInput, type PageQuery, type Playlist, type PlaylistInput, type PlaylistPage } from "./playlist.js";

declare module "fastify" {
  /** Identité du compte renseignée seulement après vérification du JWT. */
  interface FastifyRequest {
  /** UUID provenant du JWT vérifié, jamais du corps fourni par le client. */
  authenticatedUserId?: string } }
declare module "@fastify/jwt" {
  /** Contrat du JWT utilisateur : le sujet sub identifie le propriétaire. */
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
 * Lecteurs et mutations de playlists injectés ; aucune identité propriétaire ne vient du corps envoyé
 * par le client.
 */
type Options = {
  /** Secret serveur pour vérifier ou signer les JWT ; ne doit pas être envoyé au navigateur. */
  jwtSecret: string;
  /** Liste privée paginée des playlists du compte. */
  readPlaylists: (owner: string, query: PageQuery) => Promise<PlaylistPage>;
  /** Lecture d’une seule playlist privée du compte. */
  readPlaylist: (owner: string, id: string) => Promise<Playlist | null>;
  /** Création d’une playlist privée vide avec version initiale. */
  createPlaylist?: (owner: string, input: PlaylistInput) => Promise<Playlist>;
  /** Confirme qu’un morceau peut être utilisé avant de créer une occurrence. */
  isTrackPublished?: (trackId: string) => Promise<boolean>;
  /** Ajout d’une occurrence avec contrôle de propriétaire et de version. */
  addItem?: (owner: string, id: string, trackId: string, expectedVersion: number) => Promise<Playlist>;
  /** Retrait d’une occurrence avec contrôle de propriétaire et de version. */
  removeItem?: (owner: string, id: string, itemId: string, expectedVersion: number) => Promise<Playlist>;
  /** Modification des champs de playlist avec version attendue. */
  updatePlaylist?: (owner: string, id: string, changes: Partial<PlaylistInput>, expectedVersion: number) => Promise<Playlist>;
  /** Suppression d’une playlist privée et de ses occurrences après contrôle de version. */
  deletePlaylist?: (owner: string, id: string, expectedVersion: number) => Promise<void>;
  /** Contrôle de disponibilité du stockage avant réponse de /ready. */
  ready: () => Promise<void>;
    /** Libération des ressources à la fermeture, ou clôture de la session dans le transport Playback. */
    close?: () => Promise<void>;
    /** Active ou désactive les journaux du serveur construit. */
    logger?: boolean;
};

/**
 * Construit les routes de playlists, vérifie le JWT puis les entrées et traduit les erreurs métier en
 * refus HTTP. Retourne l’application sans ouvrir de port.
 */
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
  /**
   * Vérifie le JWT et son sujet UUID ; renseigne authenticatedUserId ou répond 401 sans appeler les
   * lecteurs privés.
   */
  async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    reply.header("Cache-Control", "no-store");
    try {
      await request.jwtVerify();
      if (typeof request.user.sub !== "string" || !uuidPattern.test(request.user.sub)) throw new Error("Invalid subject");
      request.authenticatedUserId = request.user.sub.toLowerCase();
    } catch { return reply.code(401).send({ error: "unauthorized" }); }
  }
  app.get<{
    /** Paramètres de recherche HTTP, validés avant leur conversion. */
    Querystring: Record<string, unknown> }>("/playlists", { onRequest: authenticate }, async (request, reply) => {
    const query = pageQuery(request.query);
    if (!query) return reply.code(400).send({ error: "invalid_request" });
    try { return await options.readPlaylists(request.authenticatedUserId!, query); }
    catch { return reply.code(503).send({ error: "library_unavailable" }); }
  });
  app.get<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/playlists/:id", { onRequest: authenticate }, async (request, reply) => {
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
  app.post<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/playlists/:id/items", { onRequest: authenticate }, async (request, reply) => {
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
  app.delete<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string;
    /** UUID d’une occurrence précise ; retirer cette ligne ne retire pas les autres occurrences du morceau. */
    itemId: string } }>("/playlists/:id/items/:itemId", { onRequest: authenticate }, async (request, reply) => {
    const expectedVersion = versionInput(request.body);
    if (expectedVersion === null || !uuidPattern.test(request.params.id) || !uuidPattern.test(request.params.itemId)) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    try {
      if (!options.removeItem) throw new Error("Missing removal writer");
      return await options.removeItem(request.authenticatedUserId!, request.params.id.toLowerCase(), request.params.itemId.toLowerCase(), expectedVersion);
    } catch (error) {
      if (error instanceof PlaylistError) return reply.code(error.status).send({ error: error.code });
      return reply.code(503).send({ error: "library_unavailable" });
    }
  });
  app.patch<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/playlists/:id", { onRequest: authenticate }, async (request, reply) => {
    const input = editInput(request.body);
    if (!input || !uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.updatePlaylist) throw new Error("Missing update writer");
      return await options.updatePlaylist(request.authenticatedUserId!, request.params.id.toLowerCase(), input.changes, input.expectedVersion);
    } catch (error) {
      if (error instanceof PlaylistError) return reply.code(error.status).send({ error: error.code });
      return reply.code(503).send({ error: "library_unavailable" });
    }
  });
  app.delete<{
    /** Paramètres extraits du chemin de la route, validés avant accès au stockage. */
    Params: {
    /** Identifiant de cette entité ; distinct des identifiants des objets liés. */
    id: string } }>("/playlists/:id", { onRequest: authenticate }, async (request, reply) => {
    const expectedVersion = versionInput(request.body);
    if (expectedVersion === null || !uuidPattern.test(request.params.id)) return reply.code(400).send({ error: "invalid_request" });
    try {
      if (!options.deletePlaylist) throw new Error("Missing deletion writer");
      await options.deletePlaylist(request.authenticatedUserId!, request.params.id.toLowerCase(), expectedVersion);
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof PlaylistError) return reply.code(error.status).send({ error: error.code });
      return reply.code(503).send({ error: "library_unavailable" });
    }
  });
  app.addHook("onClose", async () => { registry.clear(); await options.close?.(); });
  return app;
}
