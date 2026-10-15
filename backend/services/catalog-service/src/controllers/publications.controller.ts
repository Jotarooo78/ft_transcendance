/** Adaptation HTTP de la publication, sans accès SQL. */
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { PublicationsService } from '../services/publications.service.js'
/** Transmet le corps et la session ; retourne le morceau public confirmé. */
export function createPublicationsController(publications: PublicationsService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store')
    return reply
      .code(201)
      .send(await publications.publish(request.headers.authorization, request.body))
  }
}
