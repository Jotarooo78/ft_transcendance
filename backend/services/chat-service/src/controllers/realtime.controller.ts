/**
 * @file realtime.controller.ts
 * @brief Contrôleur du temps réel : délivre les tickets et accueille les connexions WebSocket.
 *
 * @details Trois fonctions, dans l'ordre où un client les utilise : `issueTicket` (route REST
 *   ordinaire, protégée par le jeton de connexion), `checkTicket` (exécutée avant l'ouverture du
 *   WebSocket pour la refuser si le ticket est mauvais) et `connect` (qui reçoit la connexion une
 *   fois ouverte). Elles sont rattachées à leurs URL dans routes/realtime.routes.ts.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import type { Hub } from '../realtime/hub.js'
import type { WsQuery } from '../schemas/conversations.schema.js'
import type { TicketsService } from '../services/tickets.service.js'

/** @brief Type de l'objet renvoyé par `createRealtimeController` : une fonction par étape. */
export type RealtimeController = ReturnType<typeof createRealtimeController>

/**
 * @brief Crée le contrôleur du temps réel.
 * @param tickets Service qui émet et consomme les tickets.
 * @param hub Registre des connexions WebSocket.
 * @returns Un objet contenant les trois fonctions.
 */
export function createRealtimeController(tickets: TicketsService, hub: Hub) {
  return {
    /**
     * @brief Répond à `POST /ws-ticket` : délivre un ticket au compte connecté.
     * @param request Requête reçue ; le compte est dans `request.userId`.
     * @returns Le ticket et sa durée de validité en secondes.
     */
    issueTicket(request: FastifyRequest) {
      return { ticket: tickets.issue(request.userId), expiresInSeconds: tickets.ttlSeconds }
    },

    /**
     * @brief Vérifie le ticket avant l'ouverture du WebSocket.
     * @details Si le ticket est inconnu, déjà utilisé ou expiré, la requête reçoit `401` et la
     *   connexion WebSocket n'est **jamais ouverte** : c'est plus simple et plus sûr que de l'ouvrir
     *   pour la fermer aussitôt. Si le ticket est bon, le compte qu'il désigne est rangé dans
     *   `request.userId` : l'identité vient du ticket, jamais d'une donnée envoyée par le client.
     * @param request Requête de connexion ; `request.query.ticket` est le ticket.
     * @param reply Réponse, utilisée pour refuser.
     */
    async checkTicket(request: FastifyRequest<{ Querystring: WsQuery }>, reply: FastifyReply) {
      const userId = tickets.consume(request.query.ticket)
      if (!userId) {
        return reply.code(401).send({ error: 'unauthorized' })
      }
      request.userId = userId
    },

    /**
     * @brief Accueille une connexion WebSocket ouverte : l'enregistre dans le hub.
     * @details Tout message envoyé par le client sur ce canal est ignoré : les envois passent par le
     *   REST. Au-delà de 5 connexions pour un même compte, la nouvelle est fermée.
     * @param socket Connexion WebSocket.
     * @param request Requête de connexion ; `request.userId` a été renseigné par `checkTicket`.
     */
    connect(socket: WebSocket, request: FastifyRequest) {
      hub.register(request.userId, socket)
    },
  }
}
