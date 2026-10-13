import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { DomainError } from '../domain-error.js'

export type FallbackError = { status: number; code: string }
type ErrorsOptions = { fallback: FallbackError }

function isClientError(error: FastifyError): boolean {
  const status = error.statusCode ?? 500
  return status >= 400 && status < 500
}

async function errors(app: FastifyInstance, { fallback }: ErrorsOptions) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof DomainError) {
      return reply.code(error.status).send({ error: error.code, ...error.details })
    }
    if (error.validation || isClientError(error)) {
      return reply.code(error.statusCode ?? 400).send({ error: 'invalid_request' })
    }
    request.log.error({ err: error }, 'unhandled error')
    return reply.code(fallback.status).send({ error: fallback.code })
  })
}

export const errorsPlugin = fp(errors, { name: 'ft-errors' })
