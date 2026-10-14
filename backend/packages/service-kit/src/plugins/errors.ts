/**
 * @file errors.ts
 * @brief Transformation des erreurs en réponses HTTP, à un seul endroit pour tout le service.
 *
 * @details Sans ce fichier, chaque route devrait entourer son code d'un `try/catch` pour répondre
 *   proprement en cas de problème. Ici, le code des routes se contente de lever une erreur avec
 *   `throw` ; ce plugin l'attrape et décide de la réponse.
 *
 * Trois cas. 1) Une `DomainError` : c'est un refus prévu, on renvoie son statut et son code. 2) Une
 * requête mal formée, refusée par la validation : on renvoie `400 invalid_request`. 3) Tout le
 * reste est une panne imprévue : on écrit l'erreur complète dans les journaux pour pouvoir la
 * corriger, et on renvoie au client une réponse générique sans aucun détail interne.
 */

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { DomainError } from '../domain-error.js'

/**
 * @brief Réponse envoyée au client pour une panne imprévue : le statut HTTP et le texte du champ
 *   `error`.
 */
export type FallbackError = { status: number; code: string }
/**
 * @brief Réglage du plugin : la réponse à envoyer en cas de panne imprévue, propre à chaque
 *   service.
 */
type ErrorsOptions = { fallback: FallbackError }

/**
 * @brief Textes renvoyés pour les refus du serveur web qui ne sont pas des demandes mal formées.
 * @details Aujourd'hui un seul cas : le statut 429, quand un client dépasse le nombre de requêtes
 *   autorisé par minute.
 */
const clientErrorCodes: Record<number, string> = { 429: 'too_many_requests' }

/**
 * @brief Dit si l'erreur est due à la requête du client plutôt qu'à une panne du serveur.
 * @param error Erreur à examiner.
 * @returns Vrai si son statut HTTP est compris entre 400 et 499.
 */
function isClientError(error: FastifyError): boolean {
  const status = error.statusCode ?? 500
  return status >= 400 && status < 500
}

/**
 * @brief Installe sur le serveur la fonction qui traite toutes les erreurs.
 * @param app Serveur du service.
 * @param options Réponse à envoyer en cas de panne imprévue.
 */
async function errors(app: FastifyInstance, { fallback }: ErrorsOptions) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof DomainError) {
      return reply.code(error.status).send({ error: error.code, ...error.details })
    }
    if (error.validation || isClientError(error)) {
      const status = error.statusCode ?? 400
      return reply.code(status).send({ error: clientErrorCodes[status] ?? 'invalid_request' })
    }
    request.log.error({ err: error }, 'unhandled error')
    return reply.code(fallback.status).send({ error: fallback.code })
  })
}

/** @brief Plugin de gestion des erreurs. `createApp` le branche automatiquement. */
export const errorsPlugin = fp(errors, { name: 'ft-errors' })
