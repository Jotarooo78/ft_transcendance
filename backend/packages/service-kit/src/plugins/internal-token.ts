import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { timingSafeEqual } from 'node:crypto'

declare module 'fastify' {
  interface FastifyInstance {
    /** À poser en onRequest sur une route /internal : exige le secret partagé entre services. */
    requireInternalToken: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

type InternalTokenOptions = { token: string }

function matches(authorization: string | undefined, token: string): boolean {
  const received = Buffer.from(authorization ?? '')
  const expected = Buffer.from(`Bearer ${token}`)
  return received.length === expected.length && timingSafeEqual(received, expected)
}

async function internalToken(app: FastifyInstance, { token }: InternalTokenOptions) {
  if (!token.trim()) {
    throw new Error('INTERNAL_SERVICE_TOKEN is required')
  }
  app.decorate('requireInternalToken', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store')
    if (!matches(request.headers.authorization, token)) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })
}

export const internalTokenPlugin = fp(internalToken, { name: 'ft-internal-token' })
