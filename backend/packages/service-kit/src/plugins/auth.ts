import jwt from '@fastify/jwt'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    /** À poser en onRequest sur une route privée : vérifie le JWT et renseigne request.userId. */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    /** UUID du compte, issu du JWT vérifié ; vide tant que authenticate n'a pas réussi. */
    userId: string
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub?: unknown; exp?: unknown; [claim: string]: unknown }
    user: { sub?: unknown; exp?: unknown; [claim: string]: unknown }
  }
}

type AuthOptions = { secret: string }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readSubject(user: { sub?: unknown; exp?: unknown }): string | null {
  const { sub, exp } = user
  const isExpired = typeof exp !== 'number' || exp <= Date.now() / 1000
  if (typeof sub !== 'string' || !uuidPattern.test(sub) || isExpired) {
    return null
  }
  return sub.toLowerCase()
}

function refuse(request: FastifyRequest, reply: FastifyReply) {
  const body = request.method === 'HEAD' ? undefined : { error: 'unauthorized' }
  return reply.code(401).send(body)
}

async function auth(app: FastifyInstance, { secret }: AuthOptions) {
  if (!secret.trim()) {
    throw new Error('JWT_SECRET is required')
  }
  await app.register(jwt, { secret, verify: { algorithms: ['HS256'] } })
  app.decorateRequest('userId', '')

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-store')
    try {
      await request.jwtVerify()
    } catch {
      return refuse(request, reply)
    }
    const subject = readSubject(request.user)
    if (subject === null) {
      return refuse(request, reply)
    }
    request.userId = subject
  })
}

export const authPlugin = fp(auth, { name: 'ft-auth' })

/** Réexporté pour que les services voient app.jwt et request.jwtVerify sans dépendre du plugin. */
export type { JWT } from '@fastify/jwt'
