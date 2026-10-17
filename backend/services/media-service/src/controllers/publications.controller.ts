/** Convertit la demande interne en réservation d’un audio prêt. */
import type { FastifyRequest } from 'fastify'
import type { PublicationsService } from '../services/publications.service.js'
/** Les identifiants ont déjà été validés par le schéma de la route. */
export function createPublicationsController(publications: PublicationsService) {
  return {
    /** Reprend le retrait d’un audio abandonné sans rendre publique sa référence. */
    async release(request: FastifyRequest<{ Params: { id: string }; Body: { ownerId: string } }>) {
      await publications.release(
        request.params.id.toLowerCase(),
        request.body.ownerId.toLowerCase()
      )
      return { released: true }
    },
    /** Réserve le même identifiant pour toute répétition de la publication. */
    reserve(request: FastifyRequest<{ Params: { id: string }; Body: { ownerId: string } }>) {
      return publications.reserve(
        request.params.id.toLowerCase(),
        request.body.ownerId.toLowerCase()
      )
    },
  }
}
