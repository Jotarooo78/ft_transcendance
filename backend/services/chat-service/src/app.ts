/**
 * @file app.ts
 * @brief Assemblage du serveur web de chat-service.
 *
 * @details Ce fichier exporte `buildApp`, qui construit le serveur complet : serveur de base commun à
 *   tous les services, routes d'exploitation (`/health`, `/ready`, `/metrics`), vérification du
 *   jeton de connexion, support du WebSocket, puis la chaîne service → contrôleur → routes des
 *   conversations, des messages et du temps réel.
 *
 * `buildApp` ne crée ni connexion à la base ni port d'écoute : tout lui est passé en paramètre. En
 * production, server.ts fournit les vrais objets ; dans les tests, on fournit de faux objets en
 * mémoire. C'est l'injection de dépendances, qui permet de tester chaque route sans base de
 * données.
 */

import websocket from '@fastify/websocket'
import { authPlugin, createApp, opsPlugin } from '@ft/service-kit'
import type { CatalogClient } from './clients/catalog.client.js'
import type { UsersClient } from './clients/users.client.js'
import type { Config } from './config/env.js'
import { createConversationsController } from './controllers/conversations.controller.js'
import { createMessagesController } from './controllers/messages.controller.js'
import { createRealtimeController } from './controllers/realtime.controller.js'
import type { Hub } from './realtime/hub.js'
import type { ConversationsRepository } from './repositories/conversations.repository.js'
import type { MessagesRepository } from './repositories/messages.repository.js'
import { registerConversationsRoutes } from './routes/conversations.routes.js'
import { registerMessagesRoutes } from './routes/messages.routes.js'
import { registerRealtimeRoutes } from './routes/realtime.routes.js'
import { createConversationsService } from './services/conversations.service.js'
import { createMessagesService } from './services/messages.service.js'
import type { TicketsService } from './services/tickets.service.js'

/**
 * @brief Nom du service, renvoyé par `/health` et utilisé comme étiquette des mesures lues par
 *   Prometheus.
 */
const service = 'chat-service'

/** @brief Tout ce que le serveur reçoit de l'extérieur pour fonctionner. */
export type Dependencies = {
  /** @brief Objet qui lit et écrit les conversations en base (voir repositories/conversations.repository.ts). */
  conversations: ConversationsRepository
  /** @brief Objet qui lit et écrit les messages en base (voir repositories/messages.repository.ts). */
  messages: MessagesRepository
  /** @brief Objet qui interroge user-service par HTTP, pour savoir si deux comptes sont amis. */
  users: UsersClient
  /** @brief Objet qui interroge catalog-service par HTTP, pour savoir si un morceau partagé est publié. */
  catalog: CatalogClient
  /** @brief Registre des connexions WebSocket (voir realtime/hub.ts). */
  hub: Hub
  /** @brief Service des tickets de connexion WebSocket (voir services/tickets.service.ts). */
  tickets: TicketsService
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
 * @brief Construit le serveur web de chat-service, sans ouvrir de port.
 * @details Toutes les routes sont privées : `authPlugin` installe la vérification du jeton de
 *   connexion, que chaque route REST utilise ; le WebSocket est protégé par un ticket. Le plugin
 *   WebSocket doit être enregistré **avant** les routes qui l'utilisent. En cas de panne imprévue, le
 *   client reçoit `503 chat_unavailable`.
 * @param config Configuration ; seul le secret des jetons (`jwtSecret`) est utilisé ici.
 * @param dependencies Repositories, clients des utilisateurs et du catalogue, hub, tickets, test de disponibilité et
 *   fonction de fermeture.
 * @returns Le serveur Fastify, à démarrer avec `listen` ou à interroger en mémoire avec `inject` (et
 *   `injectWS` pour le WebSocket) dans un test.
 * @throws {Error} Si le secret des jetons est vide : le service refuse de démarrer.
 */
export async function buildApp(config: Pick<Config, 'jwtSecret'>, dependencies: Dependencies) {
  const { conversations, messages, users, catalog, hub, tickets } = dependencies
  const app = createApp({
    service,
    logger: dependencies.logger,
    fallback: { status: 503, code: 'chat_unavailable' },
  })

  await app.register(opsPlugin, { service, ready: dependencies.ready })
  await app.register(authPlugin, { secret: config.jwtSecret })
  await app.register(websocket)
  app.addHook('onClose', async () => {
    hub.closeAll()
    await dependencies.close?.()
  })

  registerConversationsRoutes(
    app,
    createConversationsController(createConversationsService(conversations, users))
  )
  registerMessagesRoutes(
    app,
    createMessagesController(createMessagesService(conversations, messages, users, catalog, hub))
  )
  registerRealtimeRoutes(app, createRealtimeController(tickets, hub))

  return app
}
