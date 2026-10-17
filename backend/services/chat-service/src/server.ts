/**
 * @file server.ts
 * @brief Programme principal de chat-service : c'est ce fichier que Docker lance (`npm run start`).
 *
 * @details Il fait trois choses, dans l'ordre. 1) Il lit la configuration dans les variables
 *   d'environnement et s'arrête avec un message clair si l'une manque. 2) Il crée les « vraies »
 *   dépendances : la connexion à PostgreSQL, les repositories, les clients qui interrogent
 *   user-service et catalog-service,
 *   le hub WebSocket et le service de tickets. 3) Il les donne à `buildApp` (fichier app.ts), puis
 *   ouvre le port 4006.
 *
 * Aucune règle métier ici. Ce fichier est séparé de app.ts pour que les tests puissent construire le
 * serveur avec de fausses dépendances, sans base ni réseau.
 */

import { buildApp } from './app.js'
import { createCatalogClient } from './clients/catalog.client.js'
import { createUsersClient } from './clients/users.client.js'
import { loadConfig } from './config/env.js'
import { createHub } from './realtime/hub.js'
import { createConversationsRepository } from './repositories/conversations.repository.js'
import { createMessagesRepository } from './repositories/messages.repository.js'
import { createPrisma } from './repositories/prisma.js'
import { createTicketsService } from './services/tickets.service.js'

/**
 * @brief Configuration du service, lue une seule fois au démarrage. Si une variable obligatoire
 *   manque, le service s'arrête ici.
 */
const config = loadConfig()
/**
 * @brief Connexion à la base PostgreSQL, limitée au schéma `chat`. Elle est créée une fois et fermée
 *   à l'arrêt du serveur.
 */
const prisma = createPrisma(config.databaseUrl)

/**
 * @brief Serveur web prêt à écouter, construit avec les dépendances réelles.
 * @details `ready` est la fonction appelée par la route `/ready` : une requête SQL minimale qui
 *   échoue si la base ne répond pas. `close` ferme la connexion à l'arrêt.
 */
const app = await buildApp(config, {
  conversations: createConversationsRepository(prisma),
  messages: createMessagesRepository(prisma),
  users: createUsersClient(config.usersUrl, config.internalServiceToken),
  catalog: createCatalogClient(config.catalogUrl),
  hub: createHub(),
  tickets: createTicketsService(),
  ready: () => prisma.$queryRaw`SELECT 1`,
  close: () => prisma.$disconnect(),
})

await app.listen({ port: config.port, host: '0.0.0.0' })
