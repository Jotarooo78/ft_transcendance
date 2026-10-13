import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

type OpsOptions = {
  service: string
  /** Doit rejeter quand une dépendance du service est indisponible. */
  ready: () => Promise<unknown>
}

async function ops(app: FastifyInstance, { service, ready }: OpsOptions) {
  app.get('/health', async () => ({ status: 'ok', service }))

  app.get('/ready', async (_request, reply) => {
    try {
      await ready()
      return { status: 'ready', service }
    } catch {
      return reply.code(503).send({ status: 'not-ready', service })
    }
  })

  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', app.metrics.contentType)
    return app.metrics.metrics()
  })
}

export const opsPlugin = fp(ops, { name: 'ft-ops', dependencies: ['ft-metrics'] })
