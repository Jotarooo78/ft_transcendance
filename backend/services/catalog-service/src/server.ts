/**
 * @file server.ts
 * @brief Programme principal de catalog-service : c'est ce fichier que Docker lance (`npm run
 *   start`).
 *
 * @details Il fait trois choses, dans l'ordre. 1) Il lit la configuration dans les variables
 *   d'environnement (adresse de la base, secret interne) et s'arrête immédiatement avec un message
 *   clair si l'une manque. 2) Il crée les « vraies » dépendances du service : la connexion à
 *   PostgreSQL, puis les repositories, qui sont les objets capables de lire les tables. 3) Il les
 *   donne à `buildApp` (fichier app.ts), qui assemble le serveur web, puis il ouvre le port 4002
 *   pour recevoir des requêtes.
 *
 * Ce fichier ne contient aucune règle métier : si tu cherches ce que fait une route, regarde
 * routes/, controllers/ et services/. Il est séparé de app.ts pour une raison précise : les tests
 * construisent le serveur avec de fausses dépendances en mémoire, sans base ni port, et n'ont donc
 * jamais besoin de ce fichier.
 */

import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createAssetsRepository } from './repositories/assets.repository.js'
import { createPrisma } from './repositories/prisma.js'
import { createTracksRepository } from './repositories/tracks.repository.js'

/**
 * @brief Configuration du service, lue une seule fois au démarrage.
 * @details `loadConfig` vérifie que chaque variable d'environnement obligatoire est présente et
 *   bien formée. Si ce n'est pas le cas, il lève une erreur ici et le service ne démarre pas :
 *   mieux vaut un arrêt net avec un message qui nomme la variable manquante qu'un serveur qui
 *   échoue plus tard de façon obscure.
 */
const config = loadConfig()
/**
 * @brief Connexion à la base PostgreSQL, limitée au schéma `catalog`.
 * @details Un seul client est créé pour tout le processus et partagé par tous les repositories ; il
 *   gère lui-même un groupe de connexions réutilisées. Il est fermé proprement à l'arrêt du serveur
 *   (option `close` ci-dessous).
 */
const prisma = createPrisma(config.databaseUrl)

/**
 * @brief Serveur web prêt à écouter, construit avec les dépendances réelles.
 * @details `ready` est la fonction que la route `/ready` appelle pour savoir si le service peut
 *   travailler : ici, une requête SQL minimale (`SELECT 1`) qui échoue si la base ne répond pas.
 *   `close` est appelée quand le serveur s'arrête.
 */
const app = await buildApp(config, {
  tracks: createTracksRepository(prisma),
  assets: createAssetsRepository(prisma),
  ready: () => prisma.$queryRaw`SELECT 1`,
  close: () => prisma.$disconnect(),
})

await app.listen({ port: config.port, host: '0.0.0.0' })
