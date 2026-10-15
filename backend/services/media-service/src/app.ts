/**
 * @file app.ts
 * @brief Assemblage du serveur web de media-service.
 *
 * @details Ce service stocke les fichiers : les fichiers audio des morceaux et les images
 *   (pochettes). Il reçoit les fichiers envoyés par les utilisateurs, vérifie qu'ils sont valides,
 *   les garde sur le disque, et les renvoie au lecteur audio ou à la page quand on les demande.
 *
 * Vocabulaire : dans le code, un fichier stocké s'appelle un « asset ». Les informations qui le
 * décrivent (propriétaire, type, taille, durée) sont en base de données ; son contenu est un
 * fichier ordinaire dans un dossier du disque.
 *
 * Ce fichier exporte `buildApp`, qui construit le serveur complet. `buildApp` ne crée ni connexion
 * à la base ni port d'écoute : tout lui est passé en paramètre. En production, server.ts fournit
 * les vrais objets ; dans les tests, on fournit de faux objets. C'est l'injection de dépendances.
 */

import multipart from '@fastify/multipart'
import type { CoverStore } from './domain/cover.js'
import type { PublicationsRepository } from './repositories/publications.repository.js'
import { createCoversService } from './services/covers.service.js'
import { createCoversController } from './controllers/covers.controller.js'
import { registerCoversRoutes } from './routes/covers.routes.js'
import { createPublicationsService } from './services/publications.service.js'
import { createPublicationsController } from './controllers/publications.controller.js'
import { registerPublicationsRoutes } from './routes/publications.routes.js'
import { createAudioUploadService } from './services/audio-upload.service.js'
import { authPlugin, createApp, opsPlugin, internalTokenPlugin } from '@ft/service-kit'
import type { CatalogClient } from './clients/catalog.client.js'
import type { Config } from './config/env.js'
import { createAudioController } from './controllers/audio.controller.js'
import { createFilesController } from './controllers/files.controller.js'
import { createUploadController } from './controllers/upload.controller.js'
import type { AssetsRepository } from './repositories/assets.repository.js'
import { registerAudioRoutes } from './routes/audio.routes.js'
import { registerFilesRoutes } from './routes/files.routes.js'
import { createFileDeletionService } from './services/file-deletion.service.js'
import { createFilesService } from './services/files.service.js'
import { createUploadGate } from './services/upload-gate.js'
import { createUploadService } from './services/upload.service.js'
import type { FileValidator } from './validation/validate-file.js'

/**
 * @brief Nom du service, renvoyé par `/health` et utilisé comme étiquette des mesures lues par
 *   Prometheus.
 */
const service = 'media-service'

/** @brief Tout ce que le serveur reçoit de l'extérieur pour fonctionner. */
export type Dependencies = {
  /** Remplacement atomique et nettoyage des pochettes. */
  covers: CoverStore
  /** Réservation durable et liste des audios abandonnés. */
  publications: PublicationsRepository
  /**
   * @brief Objet qui lit et écrit en base les informations sur les fichiers (voir
   *   repositories/assets.repository.ts).
   */
  assets: AssetsRepository
  /** @brief Objet qui interroge catalog-service par HTTP (voir clients/catalog.client.ts). */
  catalog: CatalogClient
  /**
   * @brief Fonction qui vérifie le contenu réel d'un fichier envoyé (voir
   *   validation/validate-file.ts).
   */
  validate: FileValidator
  /** @brief Doit rejeter quand PostgreSQL est indisponible. */
  ready: () => Promise<unknown>
  /** @brief Libère les ressources à la fermeture du serveur. */
  close?: () => Promise<unknown>
  /** @brief Active l'écriture des journaux. Vrai par défaut ; les tests le désactivent. */
  logger?: boolean
}

/**
 * @brief Construit le serveur web de media-service, sans ouvrir de port.
 * @details Il installe la lecture des formulaires avec fichier (« multipart »), la vérification du
 *   jeton de connexion, puis les services, contrôleurs et routes. En cas de panne imprévue hors des
 *   routes de fichiers, le client reçoit `503 media_unavailable`.
 * @param config Secret des jetons de connexion et dossier où sont rangés les fichiers.
 * @param dependencies Repository, client du catalogue, validateur, test de disponibilité et
 *   fonction de fermeture.
 * @returns Le serveur Fastify, à démarrer avec `listen` ou à interroger en mémoire avec `inject`
 *   dans un test.
 * @throws {Error} Si le secret des jetons est vide : le service refuse de démarrer.
 */
export async function buildApp(
  config: Pick<Config, 'jwtSecret' | 'storageDir' | 'internalServiceToken'>,
  dependencies: Dependencies
) {
  const { assets, catalog, validate } = dependencies
  const { storageDir } = config
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 503, code: 'media_unavailable' },
    // Les routes de fichiers déclarent elles-mêmes HEAD, qui répond sans corps même en erreur.
    exposeHeadRoutes: false,
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  // Media refuse aussi un jeton sans date d'expiration.
  await app.register(authPlugin, { secret: config.jwtSecret, requireExpiry: true })
  await app.register(internalTokenPlugin, { token: config.internalServiceToken })
  await app.register(multipart)

  const files = createFilesService({ storageDir, assets, catalog })
  const deletions = createFileDeletionService({ storageDir, assets, catalog })
  const uploads = createUploadService({ storageDir, assets, validate })

  const gate = createUploadGate()
  registerCoversRoutes(
    app,
    createCoversController(
      createCoversService(storageDir, assets, dependencies.covers, catalog, validate),
      gate
    )
  )
  const publications = createPublicationsService(dependencies.publications, deletions, catalog)
  registerPublicationsRoutes(app, createPublicationsController(publications))
  // Une seule passe de nettoyage à la fois ; l’arrêt attend la passe active avant de fermer SQL.
  let cleanup: Promise<unknown> | undefined
  const timer = setInterval(() => {
    if (!cleanup)
      cleanup = publications
        .expire()
        .catch((error) => app.log.error(error, 'Expired upload cleanup failed'))
        .finally(() => {
          cleanup = undefined
        })
  }, 60_000)
  timer.unref()
  app.addHook('onClose', async () => {
    clearInterval(timer)
    await cleanup
    await dependencies.close?.()
  })
  registerAudioRoutes(app, createAudioController(files))
  registerFilesRoutes(
    app,
    createFilesController(files, deletions),
    createUploadController(createAudioUploadService(storageDir, uploads, dependencies.covers), gate)
  )

  return app
}
