/**
 * @file sessions.controller.ts
 * @brief Contrôleur des sessions d'écoute : relie les requêtes HTTP sur `/sessions` au service qui
 *   sait y répondre.
 *
 * @details Un contrôleur est la couche qui parle HTTP. Quand il est appelé, deux choses ont déjà eu
 *   lieu : le jeton de connexion a été vérifié (l'identifiant du compte est dans `request.userId`)
 *   et la forme de la requête a été validée par les schémas. Le contrôleur extrait ce dont le
 *   service a besoin, l'appelle, et renvoie le résultat ; Fastify l'écrit en JSON.
 *
 * Aucune règle métier ici : elles sont dans services/ et domain/. Les fonctions de ce fichier sont
 * rattachées à leurs URL dans routes/sessions.routes.ts.
 */

import { invalidRequest, isRecord, toPagination, type PageQuery } from '@ft/service-kit'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { OpenSessionBody, ProgressBody, SessionParams } from '../schemas/sessions.schema.js'
import type { SessionsService } from '../services/sessions.service.js'

/**
 * @brief Type de l'objet renvoyé par `createSessionsController` : une fonction par route de
 *   session.
 */
export type SessionsController = ReturnType<typeof createSessionsController>

/**
 * @brief Plus grand nombre de lignes que la pagination peut sauter : la limite de PostgreSQL. Une
 *   page plus lointaine est refusée.
 */
const maxOffset = 2147483647

/**
 * @brief Vérifie qu'une demande de fermeture ne transporte aucune donnée.
 * @details Fermer une session ne demande aucune information. Un corps non vide signale un client
 *   qui se trompe de route : on préfère le refuser que l'ignorer en silence.
 * @param body Corps reçu.
 * @throws {DomainError} `400 invalid_request` si le corps n'est ni absent ni l'objet vide `{}`.
 */
function assertEmptyBody(body: unknown): void {
  const isEmpty = body === undefined || (isRecord(body) && Object.keys(body).length === 0)
  if (!isEmpty) {
    throw invalidRequest()
  }
}

/**
 * @brief Crée le contrôleur des sessions.
 * @param sessions Service des sessions, que les fonctions du contrôleur appellent.
 * @returns Un objet contenant une fonction par route.
 */
export function createSessionsController(sessions: SessionsService) {
  return {
    /**
     * @brief Répond à `POST /sessions` : ouvre une session d'écoute sur un morceau.
     * @param request Requête reçue ; `request.body.trackId` est le morceau à écouter.
     * @param reply Réponse ; elle est envoyée avec le statut 201, qui signifie « créé ».
     */
    async open(request: FastifyRequest<{ Body: OpenSessionBody }>, reply: FastifyReply) {
      const session = await sessions.open(request.userId, request.body.trackId.toLowerCase())
      return reply.code(201).send(session)
    },

    /**
     * @brief Répond à `PUT /sessions/:id/progress` : enregistre un événement de progression.
     * @param request Requête reçue ; l'URL contient la session, le corps l'événement.
     * @returns La session à jour.
     */
    progress(request: FastifyRequest<{ Params: SessionParams; Body: ProgressBody }>) {
      return sessions.progress(request.userId, request.params.id.toLowerCase(), request.body)
    },

    /**
     * @brief Répond à `POST /sessions/:id/close` : ferme la session.
     * @param request Requête reçue ; l'URL contient la session, le corps doit être vide.
     * @returns La session fermée.
     */
    close(request: FastifyRequest<{ Params: SessionParams }>) {
      assertEmptyBody(request.body)
      return sessions.close(request.userId, request.params.id.toLowerCase())
    },

    /**
     * @brief Répond à `GET /sessions` : renvoie une page de l'historique d'écoute du compte
     *   connecté.
     * @param request Requête reçue ; `request.query` contient `page` et `pageSize`.
     * @returns La page d'historique.
     * @throws {DomainError} `400 invalid_request` si la pagination demandée dépasse les limites.
     */
    history(request: FastifyRequest<{ Querystring: PageQuery }>) {
      const pagination = toPagination(request.query, { maxOffset })
      if (!pagination) {
        throw invalidRequest()
      }
      return sessions.history(request.userId, pagination)
    },
  }
}
