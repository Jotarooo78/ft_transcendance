/**
 * @file app.ts
 * @brief Assemblage du serveur web de user-service.
 *
 * @details Ce service gère tout ce qui décrit un utilisateur aux yeux des autres : son profil (nom
 *   affiché, username, bio, avatar), ses amis et son état « en ligne ». Il ne gère ni l'email ni le
 *   mot de passe, qui appartiennent à auth-service.
 *
 * Ce fichier exporte `buildApp`, qui construit le serveur complet : serveur de base commun à tous
 * les services, lecture des formulaires avec fichier (pour l'avatar), routes d'exploitation
 * (`/health`, `/ready`, `/metrics`), vérification du jeton de connexion et du jeton interne, puis
 * les chaînes service → contrôleur → routes.
 *
 * `buildApp` ne crée ni connexion à la base ni port d'écoute : tout lui est passé en paramètre. En
 * production, server.ts fournit les vrais objets ; dans les tests, on fournit de faux objets en
 * mémoire. C'est l'injection de dépendances.
 */

import multipart from '@fastify/multipart'
import { authPlugin, createApp, internalTokenPlugin, opsPlugin } from '@ft/service-kit'
import type { Config } from './config/env.js'
import { createAvatarsController } from './controllers/avatars.controller.js'
import { createInternalController } from './controllers/internal.controller.js'
import { createProfilesController } from './controllers/profiles.controller.js'
import { createSocialController } from './controllers/social.controller.js'
import { maxAvatarBytes } from './domain/avatar.js'
import type { ProfilesRepository } from './repositories/profiles.repository.js'
import type { ProvisionRepository } from './repositories/provision.repository.js'
import type { SocialRepository } from './repositories/social.repository.js'
import { registerAvatarsRoutes } from './routes/avatars.routes.js'
import { registerInternalRoutes } from './routes/internal.routes.js'
import { registerProfilesRoutes } from './routes/profiles.routes.js'
import { registerSocialRoutes } from './routes/social.routes.js'
import { createAvatarsService } from './services/avatars.service.js'
import { createProfilesService } from './services/profiles.service.js'
import { createSocialService } from './services/social.service.js'
import type { AvatarStorage } from './storage/avatar-storage.js'

/**
 * @brief Nom du service, renvoyé par `/health` et utilisé comme étiquette des mesures lues par
 *   Prometheus.
 */
const service = 'user-service'

/** @brief Tout ce que le serveur reçoit de l'extérieur pour fonctionner. */
export type Dependencies = {
  /**
   * @brief Objet qui lit et écrit les profils en base (voir repositories/profiles.repository.ts).
   */
  profiles: ProfilesRepository
  /**
   * @brief Objet qui lit et écrit les amitiés et la présence en ligne (voir
   *   repositories/social.repository.ts).
   */
  social: SocialRepository
  /**
   * @brief Objet qui crée le profil d'un nouveau compte quand auth-service le demande (voir
   *   repositories/provision.repository.ts).
   */
  provisioning: ProvisionRepository
  /**
   * @brief Objet qui écrit et lit les images d'avatar sur le disque (voir
   *   storage/avatar-storage.ts).
   */
  avatars: AvatarStorage
  /** @brief Doit rejeter quand PostgreSQL est indisponible. */
  ready: () => Promise<unknown>
  /** @brief Libère les ressources à la fermeture du serveur. */
  close?: () => Promise<unknown>
  /** @brief Active l'écriture des journaux. Vrai par défaut ; les tests le désactivent. */
  logger?: boolean
}

/**
 * @brief Construit le serveur web de user-service, sans ouvrir de port.
 * @details Deux protections sont installées. `authPlugin` vérifie le jeton de connexion d'un
 *   utilisateur. `internalTokenPlugin` vérifie le secret partagé entre services, exigé sur la seule
 *   route réservée à auth-service. En cas de panne imprévue, le client reçoit le statut 500 avec `{
 *   "error": "internal server error" }`.
 * @param config Secret des jetons de connexion et secret partagé entre services.
 * @param dependencies Repositories, stockage des avatars, test de disponibilité et fonction de
 *   fermeture.
 * @returns Le serveur Fastify, à démarrer avec `listen` ou à interroger en mémoire avec `inject`
 *   dans un test.
 * @throws {Error} Si l'un des deux secrets est vide : le service refuse de démarrer.
 */
export async function buildApp(
  config: Pick<Config, 'jwtSecret' | 'internalServiceToken'>,
  dependencies: Dependencies
) {
  const { profiles, social, provisioning, avatars } = dependencies
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 500, code: 'internal server error' },
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  await app.register(authPlugin, { secret: config.jwtSecret })
  await app.register(internalTokenPlugin, { token: config.internalServiceToken })
  await app.register(multipart, { limits: { fileSize: maxAvatarBytes, files: 1 } })
  app.addHook('onClose', async () => {
    await dependencies.close?.()
  })

  registerProfilesRoutes(app, createProfilesController(createProfilesService(profiles, social)))
  registerSocialRoutes(app, createSocialController(createSocialService(profiles, social)))
  registerAvatarsRoutes(app, createAvatarsController(createAvatarsService(profiles, avatars)))
  registerInternalRoutes(app, createInternalController(provisioning))

  return app
}
