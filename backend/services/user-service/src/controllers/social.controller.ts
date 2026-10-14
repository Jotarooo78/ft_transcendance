/**
 * @file social.controller.ts
 * @brief Contrôleur des amis et de la présence : relie les requêtes HTTP correspondantes au service
 *   qui sait y répondre.
 *
 * @details Les fonctions de ce fichier sont rattachées à leurs URL dans routes/social.routes.ts.
 */

import type { FastifyRequest } from 'fastify'
import { invalidFriendId, invalidUserId } from '../domain/errors.js'
import { isUuid } from '../domain/identifiers.js'
import type { SocialService } from '../services/social.service.js'

/** @brief Type de l'objet renvoyé par `createSocialController` : une fonction par route. */
export type SocialController = ReturnType<typeof createSocialController>

/** @brief Requête dont l'URL contient l'identifiant d'un ami (`:friendId`). */
type FriendRequest = FastifyRequest<{ Params: { friendId: string } }>

/**
 * @brief Lit l'identifiant d'ami dans l'URL et vérifie son format.
 * @param request Requête reçue.
 * @returns L'identifiant de l'ami.
 * @throws {DomainError} 400 `invalid friend id` si l'identifiant n'a pas le format attendu.
 */
function friendIdOf(request: FriendRequest): string {
  if (!isUuid(request.params.friendId)) {
    throw invalidFriendId()
  }
  return request.params.friendId
}

/**
 * @brief Crée le contrôleur des amis et de la présence.
 * @param social Service des amitiés et de la présence.
 * @returns Un objet contenant une fonction par route.
 */
export function createSocialController(social: SocialService) {
  return {
    /**
     * @brief Répond à `GET /friends` : renvoie les amis de l'utilisateur connecté.
     * @param request Requête reçue, avec un jeton de connexion valide.
     * @returns Un objet `{ friends }`.
     */
    async friends(request: FastifyRequest) {
      return { friends: await social.friends(request.userId) }
    },

    /**
     * @brief Répond à `POST /friends/:friendId` : ajoute un ami.
     * @param request Requête reçue ; l'URL contient l'identifiant du compte à ajouter.
     * @returns `{ ok: true }`.
     */
    async addFriend(request: FriendRequest) {
      await social.addFriend(request.userId, friendIdOf(request))
      return { ok: true }
    },

    /**
     * @brief Répond à `DELETE /friends/:friendId` : retire un ami.
     * @param request Requête reçue ; l'URL contient l'identifiant de l'ami.
     * @returns `{ ok: true }`.
     */
    async removeFriend(request: FriendRequest) {
      await social.removeFriend(request.userId, friendIdOf(request))
      return { ok: true }
    },

    /**
     * @brief Répond à `POST /presence/heartbeat` : enregistre un signe de vie de l'utilisateur
     *   connecté.
     * @param request Requête reçue, avec un jeton de connexion valide.
     * @returns L'état en ligne.
     */
    heartbeat(request: FastifyRequest) {
      return social.heartbeat(request.userId)
    },

    /**
     * @brief Répond à `POST /presence/offline` : déclare l'utilisateur connecté hors ligne.
     * @param request Requête reçue, avec un jeton de connexion valide.
     * @returns L'état hors ligne.
     */
    goOffline(request: FastifyRequest) {
      return social.goOffline(request.userId)
    },

    /**
     * @brief Répond à `GET /presence/:userId` : renvoie l'état en ligne d'un compte. Route
     *   accessible sans être connecté.
     * @param request Requête reçue ; l'URL contient l'identifiant du compte.
     * @returns L'état en ligne du compte.
     * @throws {DomainError} 400 `invalid user id` si l'identifiant n'a pas le format attendu.
     */
    presence(request: FastifyRequest<{ Params: { userId: string } }>) {
      if (!isUuid(request.params.userId)) {
        throw invalidUserId()
      }
      return social.presence(request.params.userId)
    },
  }
}
