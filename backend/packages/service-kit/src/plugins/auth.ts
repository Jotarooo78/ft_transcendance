/**
 * @file auth.ts
 * @brief Vérification de l'identité de l'utilisateur sur les routes privées.
 *
 * @details Quand un utilisateur se connecte, auth-service lui remet un JWT : un jeton signé qui
 *   contient son identifiant de compte et une date d'expiration. Le navigateur renvoie ce jeton
 *   avec chaque requête, dans l'en-tête `Authorization: Bearer <jeton>`.
 *
 * Ce plugin vérifie le jeton. La signature est calculée avec un secret (`JWT_SECRET`) que seuls les
 * services connaissent : un jeton modifié ou fabriqué par quelqu'un d'autre est détecté. Aucune
 * base de données n'est consultée, ce qui rend la vérification très rapide.
 *
 * Utilisation : une route privée déclare `onRequest: app.authenticate`. Si le jeton est invalide,
 * la requête est refusée par `401` et le code de la route n'est jamais exécuté. Sinon,
 * l'identifiant du compte est disponible dans `request.userId`. Règle de sécurité du projet : le
 * code lit toujours l'identité à cet endroit, jamais dans le corps ou l'URL de la requête, qu'un
 * client pourrait falsifier.
 */

import jwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * @brief Fonction à placer en `onRequest` sur une route privée. Elle vérifie le jeton de
     *   connexion et, s'il est valide, range l'identifiant du compte dans `request.userId`.
     */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    /**
     * @brief Identifiant du compte connecté, lu dans le jeton vérifié. Chaîne vide sur une route
     *   qui n'utilise pas `authenticate`.
     */
    userId: string
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub?: unknown; exp?: unknown; [claim: string]: unknown }
    user: { sub?: unknown; exp?: unknown; [claim: string]: unknown }
  }
}

/** @brief Réglages du plugin d'authentification. */
type AuthOptions = {
  /**
   * @brief Secret servant à vérifier la signature des jetons. Il doit être identique dans tous les
   *   services (`JWT_SECRET`).
   */
  secret: string
  /**
   * @brief Si vrai, un jeton sans date d'expiration est refusé. Par défaut, seul un jeton dont la
   *   date est dépassée est refusé. Media active cette exigence.
   */
  requireExpiry?: boolean
}

/** @brief Forme attendue de l'identifiant de compte contenu dans le jeton : un UUID. */
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * @brief Vérifie que le jeton porte une date d'expiration située dans le futur.
 * @param exp Champ `exp` du jeton : une date exprimée en secondes écoulées depuis le 1er janvier
 *   1970.
 * @returns Vrai si c'est un nombre et qu'il est postérieur à maintenant.
 */
function hasValidExpiry(exp: unknown): boolean {
  return typeof exp === 'number' && Number.isFinite(exp) && exp > Date.now() / 1000
}

/**
 * @brief Extrait l'identifiant du compte d'un jeton dont la signature a déjà été vérifiée.
 * @param user Contenu du jeton. Le champ `sub` (« sujet ») contient l'identifiant du compte.
 * @param requireExpiry Exiger en plus une date d'expiration.
 * @returns L'identifiant du compte en minuscules, ou null si le jeton ne contient pas un
 *   identifiant valide.
 */
function readSubject(
  user: { sub?: unknown; exp?: unknown },
  requireExpiry: boolean
): string | null {
  const { sub, exp } = user
  if (typeof sub !== 'string' || !uuidPattern.test(sub)) {
    return null
  }
  if (requireExpiry && !hasValidExpiry(exp)) {
    return null
  }
  return sub.toLowerCase()
}

/**
 * @brief Répond que l'utilisateur n'est pas authentifié : `401 { "error": "unauthorized" }`.
 * @details Une requête de méthode `HEAD` ne doit jamais recevoir de contenu : elle reçoit seulement
 *   le statut.
 * @param request Requête refusée.
 * @param reply Réponse à envoyer.
 */
function refuse(request: FastifyRequest, reply: FastifyReply) {
  const body = request.method === 'HEAD' ? undefined : { error: 'unauthorized' }
  return reply.code(401).send(body)
}

/**
 * @brief Installe la vérification des jetons sur le serveur.
 * @details Elle branche la bibliothèque `@fastify/jwt`, puis ajoute au serveur la fonction
 *   `authenticate` décrite plus haut. Les réponses des routes privées ne doivent pas être gardées
 *   en mémoire par le navigateur : l'en-tête `Cache-Control: no-store` est ajouté.
 * @param app Serveur du service.
 * @param options Secret et exigence d'une date d'expiration.
 * @throws {Error} Si le secret est vide. Le service refuse alors de démarrer, car n'importe qui
 *   pourrait fabriquer un jeton.
 */
async function auth(app: FastifyInstance, { secret, requireExpiry = false }: AuthOptions) {
  if (!secret.trim()) {
    throw new Error('JWT_SECRET is required')
  }
  await app.register(jwt, { secret, verify: { algorithms: ['HS256'] } })
  app.decorateRequest('userId', '')

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store')
    try {
      await request.jwtVerify()
    } catch {
      return refuse(request, reply)
    }
    const subject = readSubject(request.user, requireExpiry)
    if (subject === null) {
      return refuse(request, reply)
    }
    request.userId = subject
  })
}

/**
 * @brief Plugin d'authentification, à brancher dans le fichier app.ts des services qui ont des
 *   routes privées.
 */
export const authPlugin = fp(auth, { name: 'ft-auth' })

/**
 * @brief Réexporté pour que les services voient app.jwt et request.jwtVerify sans dépendre du
 *   plugin.
 */
export type { JWT } from '@fastify/jwt'
