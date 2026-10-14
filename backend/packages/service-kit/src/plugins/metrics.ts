/**
 * @file metrics.ts
 * @brief Mesure de l'activité du service, pour la supervision.
 *
 * @details Prometheus est un outil qui interroge régulièrement chaque service pour récupérer des
 *   chiffres (combien de requêtes, combien de temps elles prennent, combien de mémoire est
 *   utilisée), et Grafana les affiche en graphiques. Ce fichier produit ces chiffres.
 *
 * Dans Fastify, un « plugin » est un module qui ajoute un comportement à tout le serveur. Celui-ci
 * chronomètre chaque requête. Les noms des mesures et de leurs étiquettes sont utilisés par les
 * tableaux de bord existants : il ne faut pas les renommer.
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import client from 'prom-client'

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * @brief Ensemble des mesures du service. La route `/metrics` le lit pour répondre à
     *   Prometheus.
     */
    metrics: client.Registry
  }
  interface FastifyRequest {
    /** @brief Instant précis où la requête est arrivée, noté pour calculer sa durée à la fin. */
    startedAt: bigint
  }
}

/**
 * @brief Réglage du plugin : le nom du service, utilisé comme étiquette et comme préfixe des
 *   mesures.
 */
type MetricsOptions = { service: string }

/**
 * @brief Crée la mesure de durée des requêtes, nommée `http_request_duration_seconds`.
 * @details Un histogramme range chaque durée dans des tranches (moins de 10 ms, moins de 50 ms…),
 *   ce qui permet ensuite de calculer des moyennes et de repérer les requêtes lentes. Chaque durée
 *   est étiquetée par service, méthode HTTP, route et statut de réponse.
 * @param registry Ensemble de mesures auquel ajouter l'histogramme.
 * @returns L'histogramme, à alimenter à chaque requête.
 */
function createDurationHistogram(registry: client.Registry) {
  return new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['service', 'method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [registry],
  })
}

/**
 * @brief Branche le chronométrage sur le serveur.
 * @details Au début de chaque requête, on note l'heure. À la fin, on calcule la durée et on
 *   l'enregistre. La route est étiquetée par son modèle (`/tracks/:id`) et non par l'URL réelle
 *   (`/tracks/8f3c...`) : sinon chaque identifiant créerait sa propre série de mesures et
 *   Prometheus serait vite saturé.
 * @param app Serveur du service.
 * @param options Nom du service.
 */
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

/**
 * @brief Plugin de mesure, prêt à être branché sur un serveur. `createApp` le fait automatiquement.
 */
export const metricsPlugin = fp(metrics, { name: 'ft-metrics' })
