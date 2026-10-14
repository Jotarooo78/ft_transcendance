/**
 * @file ops.ts
 * @brief Les trois routes d'exploitation présentes sur chaque service : `/health`, `/ready` et
 *   `/metrics`.
 *
 * @details Elles ne servent pas aux utilisateurs mais à ceux qui font tourner le système. `/health`
 *   répond toujours 200 tant que le processus tourne : elle prouve que le service est vivant.
 *   `/ready` répond 200 seulement si le service peut réellement travailler, donc si sa base de
 *   données répond ; sinon 503. Docker s'en sert pour savoir quand un service est prêt. `/metrics`
 *   fournit les chiffres lus par Prometheus ; Nginx la bloque depuis l'extérieur.
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

/** @brief Réglages des routes d'exploitation. */
type OpsOptions = {
  /** @brief Nom du service, renvoyé dans les réponses pour savoir qui répond. */
  service: string
  /**
   * @brief Fonction qui teste si le service peut travailler. Elle doit échouer quand une dépendance
   *   indispensable est en panne ; en pratique, chaque service y exécute une requête SQL minimale.
   */
  ready: () => Promise<unknown>
}

/**
 * @brief Déclare les trois routes d'exploitation sur le serveur.
 * @param app Serveur du service.
 * @param options Nom du service et test de disponibilité.
 */
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

/**
 * @brief Plugin des routes d'exploitation, à brancher dans le fichier app.ts de chaque service. Il
 *   a besoin du plugin de mesure, que `createApp` installe.
 */
export const opsPlugin = fp(ops, { name: 'ft-ops', dependencies: ['ft-metrics'] })
