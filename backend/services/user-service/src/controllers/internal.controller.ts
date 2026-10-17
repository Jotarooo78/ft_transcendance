/**
 * @file internal.controller.ts
 * @brief Contrôleur des routes réservées aux autres services : la création d'un profil, demandée par
 *   auth-service, et la question « ces deux comptes sont-ils amis ? », posée par chat-service.
 *
 * @details Ces routes ne sont pas accessibles depuis le navigateur : Nginx ne les publie pas, et
 *   elles exigent le secret partagé entre services. Les fonctions sont rattachées à leurs URL dans
 *   routes/internal.routes.ts.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { invalidUserId } from '../domain/errors.js'
import { isUuid } from '../domain/identifiers.js'
import { toProvisionCommand } from '../domain/provision.js'
import type { ProvisionRepository } from '../repositories/provision.repository.js'
import type { SocialService } from '../services/social.service.js'

/**
 * @brief Type de l'objet renvoyé par `createInternalController` : une fonction par route interne.
 */
export type InternalController = ReturnType<typeof createInternalController>

/**
 * @brief Crée le contrôleur des routes internes.
 * @param provisioning Repository qui crée le profil sans doublon.
 * @param social Service des amitiés, pour répondre à « ces deux comptes sont-ils amis ? ».
 * @returns Un objet contenant les fonctions des routes internes.
 */
export function createInternalController(provisioning: ProvisionRepository, social: SocialService) {
  return {
    /**
     * @brief Répond à `PUT /internal/profiles/:userId` : crée le profil d'un nouveau compte.
     * @param request Requête envoyée par auth-service ; le corps contient la demande.
     * @param reply Réponse : statut 201 si le profil vient d'être créé, 200 si cette demande avait
     *   déjà été traitée.
     */
    async provisionProfile(
      request: FastifyRequest<{ Params: { userId: string } }>,
      reply: FastifyReply
    ) {
      const command = toProvisionCommand(request.body, request.params.userId)
      const { status } = await provisioning.provision(command)
      return reply
        .code(status === 'created' ? 201 : 200)
        .send({ status, userId: command.aggregateId })
    },

    /**
     * @brief Répond à `GET /internal/friendships/:userId/:otherId` : dit si deux comptes sont amis.
     * @details Appelée par chat-service avant chaque envoi de message, pour ne laisser discuter que
     *   des amis. Les identifiants sont mis en minuscules : c'est la forme sous laquelle les amitiés
     *   sont enregistrées.
     * @param request Requête reçue ; l'URL contient les deux identifiants.
     * @returns `{ areFriends: true }` ou `{ areFriends: false }`.
     * @throws {DomainError} 400 `invalid user id` si un identifiant n'a pas le format UUID.
     */
    async friendship(request: FastifyRequest<{ Params: { userId: string; otherId: string } }>) {
      const { userId, otherId } = request.params
      if (!isUuid(userId) || !isUuid(otherId)) {
        throw invalidUserId()
      }
      return { areFriends: await social.areFriends(userId.toLowerCase(), otherId.toLowerCase()) }
    },
  }
}
