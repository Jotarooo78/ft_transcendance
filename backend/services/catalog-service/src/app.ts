/**
 * @file app.ts
 * @brief Assemblage du serveur web de catalog-service.
 *
 * @details Ce fichier exporte une seule fonction, `buildApp`, qui construit le serveur Fastify
 *   complet : elle crée l'instance commune à tous les services, y branche les routes d'exploitation
 *   (`/health`, `/ready`, `/metrics`) et la protection des routes internes, puis crée la chaîne
 *   repository → service → contrôleur de chaque ressource et déclare les routes.
 *
 * Point essentiel : `buildApp` ne crée ni connexion à la base ni port d'écoute. Tout ce dont le
 * serveur a besoin de l'extérieur lui est passé en paramètre (`dependencies`). En production c'est
 * server.ts qui passe les vrais objets ; dans les tests, on passe de faux repositories en mémoire.
 * C'est ce qu'on appelle l'injection de dépendances, et c'est ce qui permet de tester toutes les
 * routes sans base de données.
 */

import type { ProjectsRepository } from './repositories/projects.repository.js'
import { createProjectsService } from './services/projects.service.js'
import { createProjectsController } from './controllers/projects.controller.js'
import { registerProjectsRoutes } from './routes/projects.routes.js'
import type { UsersClient } from './clients/users.client.js'
import type { MediaClient } from './clients/media.client.js'
import type { PublicationsRepository } from './repositories/publications.repository.js'
import { createPublicationsService } from './services/publications.service.js'
import { createPublicationsController } from './controllers/publications.controller.js'
import { registerPublicationsRoutes } from './routes/publications.routes.js'
import { createApp, internalTokenPlugin, opsPlugin } from '@ft/service-kit'
import type { Config } from './config/env.js'
import { createAssetsController } from './controllers/assets.controller.js'
import { createTracksController } from './controllers/tracks.controller.js'
import type { AssetsRepository } from './repositories/assets.repository.js'
import type { TracksRepository } from './repositories/tracks.repository.js'
import { registerAssetsRoutes } from './routes/assets.routes.js'
import { registerTracksRoutes } from './routes/tracks.routes.js'
import { createAssetsService } from './services/assets.service.js'
import { createTracksService } from './services/tracks.service.js'

/**
 * @brief Nom du service.
 * @details Il apparaît dans les réponses de `/health` et `/ready`, et sert de label et de préfixe
 *   aux métriques lues par Prometheus. Il ne doit pas changer : les tableaux de bord Grafana
 *   s'appuient dessus.
 */
const service = 'catalog-service'

/**
 * @brief Tout ce que le serveur reçoit de l'extérieur pour fonctionner.
 * @details En production, server.ts fournit des objets branchés sur PostgreSQL. Dans un test, on
 *   fournit des objets en mémoire qui renvoient des valeurs choisies : on peut ainsi vérifier le
 *   comportement d'une route quand la base renvoie tel résultat, ou quand elle tombe en panne.
 */
export type Dependencies = {
  /** Stockage des projets, injecté par server.ts ; facultatif pour les anciens tests ciblés. */
  projects?: ProjectsRepository
  /** Identité actuelle fournie par Users. */
  users: UsersClient
  /** Réservation durable des audios. */
  media: MediaClient
  /** Écriture idempotente et comptes crédités. */
  publications: PublicationsRepository
  /** @brief Objet qui sait lire les morceaux en base (voir repositories/tracks.repository.ts). */
  tracks: TracksRepository
  /**
   * @brief Objet qui sait dire si un fichier de Media est utilisé par le catalogue (voir
   *   repositories/assets.repository.ts).
   */
  assets: AssetsRepository
  /**
   * @brief Fonction appelée par la route `/ready` ; elle doit échouer (rejeter) quand PostgreSQL
   *   est indisponible, ce qui fait répondre 503.
   */
  ready: () => Promise<unknown>
  /**
   * @brief Fonction appelée à l'arrêt du serveur pour libérer les ressources, typiquement fermer la
   *   connexion à la base.
   */
  close?: () => Promise<unknown>
  /**
   * @brief Active l'écriture des journaux du serveur. Vrai par défaut ; les tests le mettent à faux
   *   pour garder une sortie lisible.
   */
  logger?: boolean
}

/**
 * @brief Construit le serveur web de catalog-service, sans ouvrir de port.
 * @details Étapes : 1) `createApp` crée le serveur avec les réglages communs (validation stricte,
 *   métriques, format des erreurs) et le code d'erreur renvoyé en cas de panne imprévue, `503
 *   catalog_unavailable` ; 2) on ajoute les routes d'exploitation et la protection par jeton
 *   interne ; 3) pour chaque ressource, on crée le service à partir du repository, le contrôleur à
 *   partir du service, et on déclare les routes.
 * @param config Configuration du service. Seul le jeton interne est utilisé ici, pour protéger la
 *   route `/internal/...`.
 * @param dependencies Repositories, test de disponibilité et fonction de fermeture.
 * @returns Le serveur Fastify. On peut appeler `listen` dessus pour le démarrer, ou `inject` dans
 *   un test pour lui envoyer une requête sans réseau.
 * @throws {Error} Si le jeton interne est vide : le service refuse de démarrer plutôt que de
 *   laisser une route interne sans protection.
 */
export async function buildApp(
  config: Pick<Config, 'internalServiceToken'>,
  dependencies: Dependencies
) {
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 503, code: 'catalog_unavailable' },
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  await app.register(internalTokenPlugin, { token: config.internalServiceToken })
  app.addHook('onClose', async () => {
    await dependencies.close?.()
  })

  const tracks = createTracksService(
    dependencies.tracks,
    dependencies.users,
    dependencies.publications
  )
  registerTracksRoutes(app, createTracksController(tracks))
  registerPublicationsRoutes(
    app,
    createPublicationsController(
      createPublicationsService(
        dependencies.users,
        dependencies.media,
        dependencies.publications,
        tracks
      )
    )
  )
  registerAssetsRoutes(app, createAssetsController(createAssetsService(dependencies.assets)))

  if (dependencies.projects)
    registerProjectsRoutes(
      app,
      createProjectsController(
        createProjectsService(dependencies.projects, dependencies.users, dependencies.media)
      )
    )

  return app
}
