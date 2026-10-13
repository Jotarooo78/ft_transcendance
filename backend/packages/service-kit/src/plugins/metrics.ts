import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import client from 'prom-client'

declare module 'fastify' {
  interface FastifyInstance {
    /** Registre Prometheus du service, lu par la route /metrics. */
    metrics: client.Registry
  }
  interface FastifyRequest {
    /** Instant de début de requête, pour mesurer sa durée. */
    startedAt: bigint
  }
}

type MetricsOptions = { service: string }

function createDurationHistogram(registry: client.Registry) {
  return new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [registry],
  })
}

async function metrics(app: FastifyInstance, { service }: MetricsOptions) {
  const registry = new client.Registry()
  const prefix = `${service.replaceAll('-', '_')}_`
  client.collectDefaultMetrics({ prefix, register: registry })
  const duration = createDurationHistogram(registry)

  app.decorate('metrics', registry)
  app.decorateRequest('startedAt', 0n)

  app.addHook('onRequest', async (request) => {
    request.startedAt = process.hrtime.bigint()
  })

  app.addHook('onResponse', async (request, reply) => {
    const seconds = Number(process.hrtime.bigint() - request.startedAt) / 1e9
    const route = request.routeOptions?.url ?? 'unknown'
    duration.labels(service, request.method, route, String(reply.statusCode)).observe(seconds)
  })

  app.addHook('onClose', async () => registry.clear())
}

export const metricsPlugin = fp(metrics, { name: 'ft-metrics' })
