/**
 * @file conversations.controller.ts
 * @brief Contrôleur des conversations : relie les requêtes HTTP sur `/conversations` et `/unread` au
 *   service qui sait y répondre.
 *
 * @details Un contrôleur est la couche qui parle HTTP. Quand il est appelé, deux choses ont déjà eu
 *   lieu : le jeton de connexion a été vérifié (l'identifiant du compte est dans `request.userId`)
 *   et la forme de la requête a été validée par les schémas. Le contrôleur extrait ce dont le
 *   service a besoin, l'appelle, et renvoie le résultat ; Fastify l'écrit en JSON.
 *
 * Aucune règle métier ici : elles sont dans services/ et domain/. Les fonctions de ce fichier sont
 * rattachées à leurs URL dans routes/conversations.routes.ts.
 */

import { invalidRequest, toPagination, type PageQuery } from '@ft/service-kit'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { OpenConversationBody } from '../schemas/conversations.schema.js'
import type { ConversationsService } from '../services/conversations.service.js'

/** @brief Type de l'objet renvoyé par `createConversationsController` : une fonction par route. */
export type ConversationsController = ReturnType<typeof createConversationsController>

/**
 * @brief Crée le contrôleur des conversations.
 * @param conversations Service des conversations, que les fonctions du contrôleur appellent.
 * @returns Un objet contenant une fonction par route.
 */
export function createConversationsController(conversations: ConversationsService) {
  return {
    /**
     * @brief Répond à `GET /conversations` : renvoie une page des conversations du compte connecté.
     * @param request Requête reçue ; `request.query` contient `page` et `pageSize`.
     * @returns La page de conversations.
     * @throws {DomainError} `400 invalid_request` si la pagination demandée dépasse les limites.
     */
    list(request: FastifyRequest<{ Querystring: PageQuery }>) {
      const pagination = toPagination(request.query)
      if (!pagination) {
        throw invalidRequest()
      }
      return conversations.list(request.userId, pagination)
    },

    /**
     * @brief Répond à `POST /conversations` : ouvre la conversation avec un ami.
     * @param request Requête reçue ; `request.body` contient `peerUserId`.
     * @param reply Réponse ; statut 201 si la conversation vient d'être créée, 200 si elle existait.
     */
    async open(request: FastifyRequest<{ Body: OpenConversationBody }>, reply: FastifyReply) {
      const { conversation, created } = await conversations.open(
        request.userId,
        request.body.peerUserId
      )
      return reply.code(created ? 201 : 200).send(conversation)
    },

    /**
     * @brief Répond à `GET /unread` : renvoie le nombre total de messages non lus.
     * @param request Requête reçue.
     * @returns `{ total }`.
     */
    unread(request: FastifyRequest) {
      return conversations.unreadTotal(request.userId)
    },
  }
}
