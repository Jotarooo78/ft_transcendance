/**
 * @file refusals.ts
 * @brief Fabrication de la réponse d'erreur propre à chaque route de fichiers.
 *
 * @details Dans les autres services, toutes les routes partagent la même façon de répondre en cas
 *   d'erreur. Ici, chaque route a un code de panne différent et ajoute un message en français, que
 *   le frontend affiche tel quel à l'utilisateur. Chaque route reçoit donc son propre «
 *   gestionnaire d'erreurs », fabriqué par ce fichier.
 */

import { DomainError, type FallbackError } from '@ft/service-kit'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

/**
 * @brief Réglage d'une route : que répondre à une erreur imprévue, et quel message afficher selon
 *   le statut et le code.
 */
type Refusal = {
  /** @brief Réponse à une erreur imprévue sur cette route. */
  fallback: FallbackError
  /** @brief Message destiné à l'utilisateur, choisi selon le statut et le code. */
  message?: (status: number, code: string) => string
}

/**
 * @brief Détermine le statut HTTP et le code à renvoyer pour une erreur.
 * @details Un refus prévu (`DomainError`) garde son statut et son code. Une requête mal formée
 *   donne 400. Toute autre erreur est écrite dans le journal et remplacée par la réponse de secours
 *   de la route.
 * @param error Erreur survenue.
 * @param request Requête, utilisée pour écrire dans le journal.
 * @param fallback Réponse de secours de la route.
 * @returns Le statut et le code à renvoyer.
 */
function toStatusAndCode(error: FastifyError, request: FastifyRequest, fallback: FallbackError) {
  if (error instanceof DomainError) {
    return { status: error.status, code: error.code }
  }
  if (error.validation) {
    return { status: 400, code: 'invalid_request' }
  }
  request.log.error({ err: error }, 'unhandled error')
  return fallback
}

/**
 * @brief Fabrique le gestionnaire d'erreurs d'une route.
 * @param refusal Réponse de secours et choix du message.
 * @returns Le gestionnaire. La réponse a la forme `{ error, message }` ; une requête `HEAD` reçoit
 *   le statut sans contenu.
 */
export function refuseWith({ fallback, message }: Refusal) {
  return (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const { status, code } = toStatusAndCode(error, request, fallback)
    if (request.method === 'HEAD') {
      return reply.code(status).send()
    }
    const body = message ? { error: code, message: message(status, code) } : { error: code }
    return reply.code(status).send(body)
  }
}
