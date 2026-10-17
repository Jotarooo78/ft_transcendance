import type { CollectionsRepository } from './repositories/collections.repository.js'
import type { CollectionTargets } from './clients/collection-targets.client.js'
import { createCollectionsService } from './services/collections.service.js'
import { createCollectionsController } from './controllers/collections.controller.js'
import { registerCollectionsRoutes } from './routes/collections.routes.js'
/**
 * @file app.ts
 * @brief Assemblage du serveur web de library-service.
 *
 * @details Ce fichier exporte `buildApp`, qui construit le serveur complet : serveur de base commun
 *   à tous les services, routes d'exploitation (`/health`, `/ready`, `/metrics`), vérification du
 *   jeton de connexion, puis la chaîne service → contrôleur → routes des playlists et de leurs
 *   morceaux.
 *
 * `buildApp` ne crée ni connexion à la base ni port d'écoute : tout lui est passé en paramètre. En
 * production, server.ts fournit les vrais objets ; dans les tests, on fournit de faux objets en
 * mémoire. C'est l'injection de dépendances, qui permet de tester chaque route sans base de
 * données.
 */

import { authPlugin, createApp, opsPlugin, internalTokenPlugin } from '@ft/service-kit'
import type { createPlaylistArtworkService } from './services/playlist-artwork.service.js'
import { registerPlaylistArtworkRoutes } from './routes/playlist-artwork.routes.js'
import type { CatalogClient } from './clients/catalog.client.js'
import type { Config } from './config/env.js'
import { createPlaylistItemsController } from './controllers/playlist-items.controller.js'
import { createPlaylistsController } from './controllers/playlists.controller.js'
import type { PlaylistsRepository } from './repositories/playlists.repository.js'
import { registerPlaylistItemsRoutes } from './routes/playlist-items.routes.js'
import { registerPlaylistsRoutes } from './routes/playlists.routes.js'
import { createPlaylistItemsService } from './services/playlist-items.service.js'
import { createPlaylistsService } from './services/playlists.service.js'
import type { PlaylistActionsRepository } from './repositories/playlist-actions.repository.js'
import { createPlaylistActionsService } from './services/playlist-actions.service.js'
import { registerPlaylistActionsRoutes } from './routes/playlist-actions.routes.js'

/**
 * @brief Nom du service, renvoyé par `/health` et utilisé comme étiquette des mesures lues par
 *   Prometheus.
 */
const service = 'library-service'

/** @brief Tout ce que le serveur reçoit de l'extérieur pour fonctionner. */
export type Dependencies = {
  /** Contrat Media de pochette, séparé des commandes de morceaux. */
  artwork?: ReturnType<typeof createPlaylistArtworkService>
  /** Écritures atomiques du nouveau parcours ; injectées en production. */
  actions?: PlaylistActionsRepository
  /** @brief Dépendances des références personnelles ; injectées en production. */
  collections?: { repository: CollectionsRepository; targets: CollectionTargets }
  /**
   * @brief Objet qui lit et écrit les playlists en base (voir
   *   repositories/playlists.repository.ts).
   */
  playlists: PlaylistsRepository
  /**
   * @brief Objet qui interroge catalog-service par HTTP, pour savoir si un morceau existe et est
   *   publié (voir clients/catalog.client.ts).
   */
  catalog: CatalogClient
  /**
   * @brief Fonction appelée par la route `/ready` ; elle doit échouer quand PostgreSQL est
   *   indisponible, ce qui fait répondre 503.
   */
  ready: () => Promise<unknown>
  /**
   * @brief Fonction appelée à l'arrêt du serveur pour libérer les ressources, typiquement fermer la
   *   connexion à la base.
   */
  close?: () => Promise<unknown>
  /** @brief Active l'écriture des journaux. Vrai par défaut ; les tests le désactivent. */
  logger?: boolean
}

/**
 * @brief Construit le serveur web de library-service, sans ouvrir de port.
 * @details Les routes personnelles utilisent `authPlugin` pour vérifier le jeton.
 *   Seule la lecture explicite de partage est publique. En cas de panne imprévue, le client reçoit `503
 *   library_unavailable`.
 * @param config Configuration ; seul le secret des jetons (`jwtSecret`) est utilisé ici.
 * @param dependencies Repository, client du catalogue, test de disponibilité et fonction de
 *   fermeture.
 * @returns Le serveur Fastify, à démarrer avec `listen` ou à interroger en mémoire avec `inject`
 *   dans un test.
 * @throws {Error} Si le secret des jetons est vide : le service refuse de démarrer.
 */
export async function buildApp(
  config: Pick<Config, 'jwtSecret'> & Partial<Pick<Config, 'internalServiceToken'>>,
  dependencies: Dependencies
) {
  const { playlists, catalog } = dependencies
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 503, code: 'library_unavailable' },
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  await app.register(authPlugin, { secret: config.jwtSecret })
  if (dependencies.artwork) {
    await app.register(internalTokenPlugin, { token: config.internalServiceToken ?? '' })
    registerPlaylistArtworkRoutes(app, dependencies.artwork)
  }
  app.addHook('onClose', async () => {
    await dependencies.close?.()
  })

  registerPlaylistsRoutes(app, createPlaylistsController(createPlaylistsService(playlists)))
  if (dependencies.actions)
    registerPlaylistActionsRoutes(
      app,
      createPlaylistActionsService(playlists, dependencies.actions, catalog)
    )
  registerPlaylistItemsRoutes(
    app,
    createPlaylistItemsController(createPlaylistItemsService(playlists, catalog))
  )

  if (dependencies.collections) {
    const { repository, targets } = dependencies.collections
    registerCollectionsRoutes(
      app,
      createCollectionsController(createCollectionsService(repository, targets, playlists))
    )
  }
  return app
}
