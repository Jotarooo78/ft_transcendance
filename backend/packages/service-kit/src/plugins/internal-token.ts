/**
 * @file internal-token.ts
 * @brief Protection des routes réservées aux autres services.
 *
 * @details Certaines routes ne doivent jamais être appelées par un navigateur, seulement par un
 *   autre service du backend. Leur chemin commence par `/internal/`. Exemple : la route par
 *   laquelle auth-service demande à user-service de créer un profil.
 *
 * Deux barrières les protègent. Nginx, le serveur placé devant le backend, refuse toute requête
 * extérieure vers `/internal/`. Et la route elle-même exige un secret partagé entre services
 * (`INTERNAL_SERVICE_TOKEN`), différent du secret des jetons utilisateurs. Ce fichier s'occupe de
 * la seconde barrière.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { timingSafeEqual } from 'node:crypto'

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * @brief Fonction à placer en `onRequest` sur une route `/internal/...`. Elle refuse par `401`
     *   tout appel qui ne présente pas le secret partagé entre services.
     */
    requireInternalToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

/** @brief Réglage du plugin : le secret partagé entre services. */
type InternalTokenOptions = { token: string }

/**
 * @brief Vérifie que l'en-tête `Authorization` reçu contient exactement le secret attendu.
 * @details La comparaison est faite « en temps constant » : elle prend la même durée que le secret
 *   soit presque bon ou complètement faux. Avec une comparaison ordinaire, qui s'arrête au premier
 *   caractère différent, un attaquant pourrait deviner le secret caractère par caractère en
 *   mesurant le temps de réponse.
 * @param authorization En-tête reçu, ou rien s'il est absent.
 * @param token Secret attendu.
 * @returns Vrai si l'en-tête vaut exactement `Bearer <secret>`.
 */
function matches(authorization: string | undefined, token: string): boolean {
  const received = Buffer.from(authorization ?? '')
  const expected = Buffer.from(`Bearer ${token}`)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

/**
 * @brief Installe la protection des routes internes sur le serveur.
 * @param app Serveur du service.
 * @param options Secret partagé entre services.
 * @throws {Error} Si le secret est vide. Le service refuse alors de démarrer plutôt que de laisser
 *   ces routes ouvertes.
 */
async function internalToken(app: FastifyInstance, { token }: InternalTokenOptions) {
  if (!token.trim()) {
    throw new Error('INTERNAL_SERVICE_TOKEN is required')
  }
  app.decorate('requireInternalToken', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store')
    if (!matches(request.headers.authorization, token)) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })
}

/**
 * @brief Plugin de protection des routes internes, à brancher dans le fichier app.ts des services
 *   qui en exposent.
 */
export const internalTokenPlugin = fp(internalToken, { name: 'ft-internal-token' })
