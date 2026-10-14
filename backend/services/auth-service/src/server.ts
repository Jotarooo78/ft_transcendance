/**
 * @file server.ts
 * @brief Programme principal de auth-service : c'est ce fichier que Docker lance (`npm run start`).
 *
 * @details Il fait quatre choses, dans l'ordre. 1) Il lit la configuration dans les variables
 *   d'environnement et s'arrête avec un message clair si l'une manque. 2) Il crée les « vraies »
 *   dépendances : la connexion à PostgreSQL, les repositories et le client qui appelle
 *   user-service. 3) Il les donne à `buildApp` (fichier app.ts), puis ouvre le port 4000. 4) Il
 *   lance une tâche de fond qui, toutes les 2 secondes, renvoie à user-service les demandes de
 *   création de profil qui n'ont pas encore abouti (voir workers/outbox.worker.ts).
 *
 * Aucune règle métier ici. Ce fichier est séparé de app.ts pour que les tests puissent construire
 * le serveur avec de fausses dépendances, sans base ni réseau.
 */

import { buildApp } from './app.js'
import { createUsersClient } from './clients/users.client.js'
import { loadConfig } from './config/env.js'
import { createAccountsRepository } from './repositories/accounts.repository.js'
import { createOutboxRepository } from './repositories/outbox.repository.js'
import { createPrisma } from './repositories/prisma.js'
import { createProfileDeliveryService } from './services/profile-delivery.service.js'
import { createOutboxWorker } from './workers/outbox.worker.js'

/**
 * @brief Configuration du service, lue une seule fois au démarrage. Si une variable obligatoire
 *   manque, le service s'arrête ici.
 */
const config = loadConfig()
/**
 * @brief Connexion à la base PostgreSQL, limitée au schéma `auth`. Elle est créée une fois et
 *   fermée à l'arrêt du serveur.
 */
const prisma = createPrisma(config.databaseUrl)
/** @brief Objet qui lit et met à jour les demandes de création de profil en attente d'envoi. */
const outbox = createOutboxRepository(prisma)
/** @brief Objet qui appelle user-service par HTTP pour lui demander de créer un profil. */
const users = createUsersClient({
  baseUrl: config.usersUrl,
  internalToken: config.internalServiceToken,
})

/** @brief Serveur web prêt à écouter, construit avec les dépendances réelles. */
const app = await buildApp(config, {
  accounts: createAccountsRepository(prisma),
  outbox,
  users,
  ready: () => prisma.$queryRaw`SELECT 1`,
  close: () => prisma.$disconnect(),
})

/**
 * @brief Tâche de fond qui renvoie périodiquement les demandes de profil non abouties. Elle est
 *   arrêtée proprement à la fermeture du serveur.
 */
const worker = createOutboxWorker({
  delivery: createProfileDeliveryService(outbox, users),
  log: app.log,
})
app.addHook('onClose', async () => worker.stop())

await app.listen({ port: config.port, host: '0.0.0.0' })
worker.start()
