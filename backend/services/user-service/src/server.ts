/**
 * @file server.ts
 * @brief Programme principal de user-service : c'est ce fichier que Docker lance (`npm run start`).
 *
 * @details Il fait trois choses, dans l'ordre. 1) Il lit la configuration dans les variables
 *   d'environnement et s'arrête avec un message clair si l'une manque. 2) Il crée les « vraies »
 *   dépendances : la connexion à PostgreSQL, les repositories (profils, amitiés et présence,
 *   création de profil) et le stockage des fichiers d'avatar, dont il crée le dossier s'il n'existe
 *   pas. 3) Il les donne à `buildApp` (fichier app.ts), puis ouvre le port 4001.
 *
 * Aucune règle métier ici. Ce fichier est séparé de app.ts pour que les tests puissent construire
 * le serveur avec de fausses dépendances, sans base ni disque.
 */

import { buildApp } from './app.js'
import { loadConfig } from './config/env.js'
import { createPrisma } from './repositories/prisma.js'
import { createProfilesRepository } from './repositories/profiles.repository.js'
import { createProvisionRepository } from './repositories/provision.repository.js'
import { createSocialRepository } from './repositories/social.repository.js'
import { createAvatarStorage } from './storage/avatar-storage.js'

/**
 * @brief Configuration du service, lue une seule fois au démarrage. Si une variable obligatoire
 *   manque, le service s'arrête ici.
 */
const config = loadConfig()
/**
 * @brief Connexion à la base PostgreSQL, limitée au schéma `users`. Elle est créée une fois et
 *   fermée à l'arrêt du serveur.
 */
const prisma = createPrisma(config.databaseUrl)
/**
 * @brief Objet qui écrit et lit les images d'avatar dans un dossier du disque (un volume Docker,
 *   pour qu'elles survivent au redémarrage du conteneur).
 */
const avatars = createAvatarStorage(config.avatarStorageDir)
await avatars.prepare()

/** @brief Serveur web prêt à écouter, construit avec les dépendances réelles. */
const app = await buildApp(config, {
  profiles: createProfilesRepository(prisma),
  social: createSocialRepository(prisma),
  provisioning: createProvisionRepository(prisma),
  avatars,
  ready: () => prisma.$queryRaw`SELECT 1`,
  close: () => prisma.$disconnect(),
})

await app.listen({ port: config.port, host: '0.0.0.0' })
