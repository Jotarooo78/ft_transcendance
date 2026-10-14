/**
 * @file app.ts
 * @brief Assemblage du serveur web de auth-service.
 *
 * @details Ce service gère l'identité de connexion : il crée les comptes (email et mot de passe),
 *   vérifie les identifiants à la connexion et délivre le jeton de connexion. Ce jeton, appelé JWT,
 *   est un texte signé que le navigateur renvoie ensuite à chaque requête ; les autres services
 *   vérifient sa signature pour savoir qui les appelle, sans avoir à interroger auth-service.
 *
 * Ce fichier exporte `buildApp`, qui construit le serveur complet : serveur de base commun à tous
 * les services, routes d'exploitation (`/health`, `/ready`, `/metrics`), signature des jetons,
 * limitation du nombre de requêtes, puis la chaîne services → contrôleur → routes.
 *
 * `buildApp` ne crée ni connexion à la base ni port d'écoute : tout lui est passé en paramètre. En
 * production, server.ts fournit les vrais objets ; dans les tests, on fournit de faux objets en
 * mémoire. C'est l'injection de dépendances.
 */

import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { createApp, opsPlugin } from '@ft/service-kit'
import argon2 from 'argon2'
import type { UsersClient } from './clients/users.client.js'
import type { Config } from './config/env.js'
import { createAuthController } from './controllers/auth.controller.js'
import type { AccountsRepository } from './repositories/accounts.repository.js'
import type { OutboxRepository } from './repositories/outbox.repository.js'
import { registerAuthRoutes } from './routes/auth.routes.js'
import { createLoginService } from './services/login.service.js'
import { createProfileDeliveryService } from './services/profile-delivery.service.js'
import { createSignupService } from './services/signup.service.js'

/**
 * @brief Nom du service, renvoyé par `/health` et utilisé comme étiquette des mesures lues par
 *   Prometheus.
 */
const service = 'auth-service'
/**
 * @brief Durée de validité d'un jeton de connexion : une heure. Passé ce délai, l'utilisateur doit
 *   se reconnecter.
 */
const tokenLifetime = '1h'

/** @brief Tout ce que le serveur reçoit de l'extérieur pour fonctionner. */
export type Dependencies = {
  /**
   * @brief Objet qui crée et lit les comptes en base (voir repositories/accounts.repository.ts).
   */
  accounts: AccountsRepository
  /**
   * @brief Objet qui lit et met à jour les demandes de création de profil en attente (voir
   *   repositories/outbox.repository.ts).
   */
  outbox: OutboxRepository
  /** @brief Objet qui appelle user-service par HTTP (voir clients/users.client.ts). */
  users: UsersClient
  /** @brief Doit rejeter quand PostgreSQL est indisponible. */
  ready: () => Promise<unknown>
  /** @brief Libère les ressources à la fermeture du serveur. */
  close?: () => Promise<unknown>
  /** @brief Active l'écriture des journaux. Vrai par défaut ; les tests le désactivent. */
  logger?: boolean
  /**
   * @brief Fonction qui transforme un mot de passe en empreinte avant de le stocker.
   * @details Par défaut, c'est l'algorithme argon2, volontairement lent pour résister aux attaques.
   *   Les tests la remplacent par une version instantanée.
   */
  hashPassword?: (password: string) => Promise<string>
  /**
   * @brief Fonction qui dit si un mot de passe saisi correspond à une empreinte stockée. Par
   *   défaut, argon2.
   */
  verifyPassword?: (hash: string, password: string) => Promise<boolean>
}

/**
 * @brief Construit le serveur web de auth-service, sans ouvrir de port.
 * @details En cas de panne imprévue, le client reçoit le statut 500 avec `{ "error": "internal
 *   server error" }`. Le module de limitation est installé en mode « non global » : il ne
 *   s'applique qu'aux routes qui le demandent (`/signup` et `/login`), et seulement si une limite
 *   est configurée.
 * @param config Secret servant à signer les jetons, et limites de requêtes.
 * @param dependencies Repositories, client de user-service, test de disponibilité, fonction de
 *   fermeture et fonctions de hachage.
 * @returns Le serveur Fastify, à démarrer avec `listen` ou à interroger en mémoire avec `inject`
 *   dans un test.
 */
export async function buildApp(
  config: Pick<Config, 'jwtSecret' | 'rateLimits'>,
  dependencies: Dependencies
) {
  const { accounts, outbox, users } = dependencies
  const { hashPassword = argon2.hash, verifyPassword = argon2.verify } = dependencies
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 500, code: 'internal server error' },
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  await app.register(jwt, { secret: config.jwtSecret })
  // Enregistré avant les routes, sans limite globale : seules celles qui en déclarent une sont
  // limitées. Le plugin n'agit que sur les routes déclarées après lui.
  await app.register(rateLimit, { global: false })
  app.addHook('onClose', async () => {
    await dependencies.close?.()
  })

  const delivery = createProfileDeliveryService(outbox, users)
  const signups = createSignupService({ accounts, delivery, hashPassword })
  const logins = createLoginService({
    accounts,
    verifyPassword,
    signToken: ({ id, email }) => app.jwt.sign({ sub: id, email }, { expiresIn: tokenLifetime }),
  })
  registerAuthRoutes(app, createAuthController(signups, logins), config.rateLimits)

  return app
}
