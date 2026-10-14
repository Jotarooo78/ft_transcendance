/**
 * @file app.ts
 * @brief Assemblage du serveur web de playback-service.
 *
 * @details Ce service enregistre ce que chaque utilisateur écoute : quel morceau, quand, et pendant
 *   combien de temps. Ce fichier exporte `buildApp`, qui construit le serveur complet : serveur de
 *   base commun à tous les services, routes d'exploitation (`/health`, `/ready`, `/metrics`),
 *   vérification du jeton de connexion, puis la chaîne service → contrôleur → routes des sessions
 *   d'écoute.
 *
 * `buildApp` ne crée ni connexion à la base ni port d'écoute : tout lui est passé en paramètre. En
 * production, server.ts fournit les vrais objets ; dans les tests, on fournit de faux objets en
 * mémoire. C'est l'injection de dépendances, qui permet de tester chaque route sans base de
 * données.
 */

import { authPlugin, createApp, opsPlugin } from '@ft/service-kit'
import type { CatalogClient } from './clients/catalog.client.js'
import type { Config } from './config/env.js'
import { createSessionsController } from './controllers/sessions.controller.js'
import type { SessionsRepository } from './repositories/sessions.repository.js'
import { registerSessionsRoutes } from './routes/sessions.routes.js'
import { createSessionsService } from './services/sessions.service.js'

/**
 * @brief Nom du service, renvoyé par `/health` et utilisé comme étiquette des mesures lues par
 *   Prometheus.
 */
const service = 'playback-service'

/** @brief Tout ce que le serveur reçoit de l'extérieur pour fonctionner. */
export type Dependencies = {
  /**
   * @brief Objet qui lit et écrit les sessions d'écoute en base (voir
   *   repositories/sessions.repository.ts).
   */
  sessions: SessionsRepository
  /**
   * @brief Objet qui interroge catalog-service par HTTP, pour connaître la durée d'un morceau (voir
   *   clients/catalog.client.ts).
   */
  catalog: CatalogClient
  /** @brief Doit rejeter quand PostgreSQL est indisponible. */
  ready: () => Promise<unknown>
  /** @brief Libère les ressources à la fermeture du serveur. */
  close?: () => Promise<unknown>
  /** @brief Active l'écriture des journaux. Vrai par défaut ; les tests le désactivent. */
  logger?: boolean
}

/**
 * @brief Construit le serveur web de playback-service, sans ouvrir de port.
 * @details Toutes les routes de ce service sont privées : `authPlugin` installe la vérification du
 *   jeton de connexion, que chaque route utilise. En cas de panne imprévue, le client reçoit `503
 *   playback_unavailable`.
 * @param config Configuration ; seul le secret des jetons (`jwtSecret`) est utilisé ici.
 * @param dependencies Repository, client du catalogue, test de disponibilité et fonction de
 *   fermeture.
 * @returns Le serveur Fastify, à démarrer avec `listen` ou à interroger en mémoire avec `inject`
 *   dans un test.
 * @throws {Error} Si le secret des jetons est vide : le service refuse de démarrer.
 */
export async function buildApp(config: Pick<Config, 'jwtSecret'>, dependencies: Dependencies) {
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 503, code: 'playback_unavailable' },
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  await app.register(authPlugin, { secret: config.jwtSecret })
  app.addHook('onClose', async () => {
    await dependencies.close?.()
  })

  const sessions = createSessionsService(dependencies.sessions, dependencies.catalog)
  registerSessionsRoutes(app, createSessionsController(sessions))

  return app
}
