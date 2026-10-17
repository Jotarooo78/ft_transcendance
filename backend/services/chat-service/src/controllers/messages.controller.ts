/**
 * @file messages.controller.ts
 * @brief Contrôleur des messages : relie les requêtes HTTP sur `/conversations/:id/messages` et
 *   `/conversations/:id/read` au service qui sait y répondre.
 *
 * @details Même principe que conversations.controller.ts. Les fonctions de ce fichier sont rattachées
 *   à leurs URL dans routes/messages.routes.ts. L'identité vient toujours de `request.userId`.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { toMessageId } from '../domain/message.js'
import type {
  ConversationParams,
  HistoryQuery,
  MessageParams,
  ReadBody,
  SendMessageBody,
} from '../schemas/messages.schema.js'
import type { MessagesService } from '../services/messages.service.js'

/** @brief Type de l'objet renvoyé par `createMessagesController` : une fonction par route. */
export type MessagesController = ReturnType<typeof createMessagesController>

/**
 * @brief Crée le contrôleur des messages.
 * @param messages Service des messages, que les fonctions du contrôleur appellent.
 * @returns Un objet contenant une fonction par route.
 */
export function createMessagesController(messages: MessagesService) {
  return {
    /**
     * @brief Répond à `GET /conversations/:id/messages` : renvoie une page de l'historique.
     * @param request Requête reçue ; `request.query` contient `before`, `after` et `limit`.
     * @returns `{ items, hasMore }`.
     */
    history(request: FastifyRequest<{ Params: ConversationParams; Querystring: HistoryQuery }>) {
      return messages.history(request.userId, request.params.id.toLowerCase(), request.query)
    },

    /**
     * @brief Répond à `POST /conversations/:id/messages` : envoie un message.
     * @param request Requête reçue ; `request.body` contient le texte et/ou le morceau partagé.
     * @param reply Réponse ; elle est envoyée avec le statut 201, qui signifie « créé ».
     */
    async send(
      request: FastifyRequest<{ Params: ConversationParams; Body: SendMessageBody }>,
      reply: FastifyReply
    ) {
      const message = await messages.send(
        request.userId,
        request.params.id.toLowerCase(),
        request.body
      )
      return reply.code(201).send(message)
    },

    /**
     * @brief Répond à `DELETE /conversations/:id/messages/:messageId` : supprime un de ses messages.
     * @param request Requête reçue ; l'URL contient la conversation et le message.
     * @returns Le message, désormais sans texte.
     */
    remove(request: FastifyRequest<{ Params: MessageParams }>) {
      return messages.remove(
        request.userId,
        request.params.id.toLowerCase(),
        toMessageId(request.params.messageId)
      )
    },

    /**
     * @brief Répond à `POST /conversations/:id/read` : marque la conversation comme lue.
     * @param request Requête reçue ; `request.body` contient `upToMessageId`.
     * @returns `{ lastReadMessageId }`.
     */
    markRead(request: FastifyRequest<{ Params: ConversationParams; Body: ReadBody }>) {
      return messages.markRead(
        request.userId,
        request.params.id.toLowerCase(),
        BigInt(request.body.upToMessageId)
      )
    },
  }
}
