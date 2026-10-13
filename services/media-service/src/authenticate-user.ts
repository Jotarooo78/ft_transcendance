/** Vérification du JWT avant toute réception ou lecture privée Media. */
import type { FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  /** Ajoute l’UUID du propriétaire après authentification réussie. */
  interface FastifyRequest {
  /** UUID provenant du JWT vérifié, jamais du corps fourni par le client. */
  authenticatedUserId?: string } }
declare module "@fastify/jwt" {
  /** Sujet et expiration attendus dans le JWT signé pour ce compte. */
  interface FastifyJWT {
    /** Données du jeton ou du message, à valider avant leur utilisation. */
    payload: {
    /** Sujet du JWT : UUID du compte, vérifié avant de servir des données privées. */
    sub?: unknown;
    /** Expiration du JWT exprimée en secondes depuis l’époque Unix. */
    exp?: number; [claim: string]: unknown };
    /** Informations du JWT décodées et signature vérifiée par le plugin Fastify. */
    user: {
    /** Sujet du JWT : UUID du compte, vérifié avant de servir des données privées. */
    sub?: unknown;
    /** Expiration du JWT exprimée en secondes depuis l’époque Unix. */
    exp?: number; [claim: string]: unknown } }
}

/** Reconnaît le format UUID accepté par ce contrat avant les lectures ou écritures. */
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Attach only to private routes: public audio keeps its publication check.
/**
 * Vérifie la signature, le sujet UUID et l’expiration avant de renseigner le propriétaire ; répond
 * 401, sans corps pour HEAD, en cas de refus.
 */
export async function authenticateUser(request: FastifyRequest, reply: FastifyReply) {
  request.authenticatedUserId = undefined;
  reply.header("Cache-Control", "no-store");
  try {
    await request.jwtVerify();
    const { sub, exp } = request.user;
    if (typeof sub !== "string" || !uuidPattern.test(sub) ||
      typeof exp !== "number" || !Number.isFinite(exp) || exp <= Date.now() / 1000) {
      throw new Error("Invalid session");
    }
    request.authenticatedUserId = sub.toLowerCase();
  } catch { return reply.code(401).send(request.method === "HEAD" ? undefined : { error: "unauthorized" }); }
}
