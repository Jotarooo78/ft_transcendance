/** Convertit la demande interne en réservation d’un audio prêt. */
import type { FastifyRequest } from 'fastify'
import type { PublicationsService } from '../services/publications.service.js'
/** Les identifiants ont déjà été validés par le schéma de la route. */
export function createPublicationsController(publications: PublicationsService) {
  return {
    /** Réserve le même identifiant pour toute répétition de la publication. */
    reserve(request: FastifyRequest<{ Params: { id: string }; Body: { ownerId: string } }>) {
      return publications.reserve(
        request.params.id.toLowerCase(),
        request.body.ownerId.toLowerCase()
      )
    },
  }
}
