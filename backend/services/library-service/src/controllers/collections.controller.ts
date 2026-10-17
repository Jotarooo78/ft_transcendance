import { invalidRequest, toPagination, type PageQuery } from '@ft/service-kit'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { CollectionKind } from '../domain/collection.js'
import type { CollectionsService } from '../services/collections.service.js'
/** @brief Requête visant une référence personnelle. */
type TargetRequest = FastifyRequest<{ Params: { kind: CollectionKind; id: string } }>
/** @brief Adapte HTTP aux opérations de bibliothèque, sans accepter d'identité dans le corps. */
export function createCollectionsController(service: CollectionsService) {
  return {
    /** @brief Valide les bornes de pagination communes. */
    list(request: FastifyRequest<{ Params: { kind: CollectionKind }; Querystring: PageQuery }>) {
      const pagination = toPagination(request.query)
      if (!pagination) throw invalidRequest()
      return service.list(request.userId, request.params.kind, pagination)
    },
    /** @brief Confirme l'ajout seulement après persistance. */
    async save(request: TargetRequest, reply: FastifyReply) {
      await service.save(request.userId, request.params.kind, request.params.id.toLowerCase())
      return reply.code(204).send()
    },
    /** @brief Confirme le retrait, y compris quand il était déjà appliqué. */
    async remove(request: TargetRequest, reply: FastifyReply) {
      await service.remove(request.userId, request.params.kind, request.params.id.toLowerCase())
      return reply.code(204).send()
    },
  }
}
