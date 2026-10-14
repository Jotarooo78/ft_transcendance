/**
 * @file internal.controller.ts
 * @brief Contrôleur de la route réservée à auth-service, par laquelle celui-ci demande la création
 *   d'un profil.
 *
 * @details Cette route n'est pas accessible depuis le navigateur : Nginx ne la publie pas, et elle
 *   exige le secret partagé entre services. La fonction est rattachée à son URL dans
 *   routes/internal.routes.ts.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { toProvisionCommand } from '../domain/provision.js'
import type { ProvisionRepository } from '../repositories/provision.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createInternalController` : l'unique fonction de la route
 *   interne.
 */
export type InternalController = ReturnType<typeof createInternalController>

/**
 * @brief Crée le contrôleur de la route interne.
 * @param provisioning Repository qui crée le profil sans doublon.
 * @returns Un objet contenant la fonction de la route.
 */
export function createInternalController(provisioning: ProvisionRepository) {
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
  }
}
