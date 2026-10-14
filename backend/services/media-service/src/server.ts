/**
 * @file server.ts
 * @brief Programme principal de media-service : c'est ce fichier que Docker lance (`npm run
 *   start`).
 *
 * @details Il fait quatre choses, dans l'ordre. 1) Il lit la configuration dans les variables
 *   d'environnement. 2) Il crée les « vraies » dépendances : connexion à PostgreSQL, repository,
 *   client du catalogue et validateur de fichiers. 3) Il répare ce qu'un arrêt brutal aurait laissé
 *   à moitié fait : envois de fichiers interrompus et suppressions inachevées. 4) Seulement
 *   ensuite, il construit le serveur avec `buildApp` et ouvre le port 4003.
 *
 * L'étape 3 passe avant l'ouverture du port pour une raison précise : tant que le disque et la base
 * ne racontent pas la même chose, aucune requête ne doit être acceptée.
 */

import { buildApp } from './app.js'
import { createCatalogClient } from './clients/catalog.client.js'
import { loadConfig } from './config/env.js'
import { createAssetsRepository } from './repositories/assets.repository.js'
import { createPrisma } from './repositories/prisma.js'
import { createFileDeletionService } from './services/file-deletion.service.js'
import { createUploadService } from './services/upload.service.js'
import { createFileValidator } from './validation/validate-file.js'

/**
 * @brief Configuration du service, lue une seule fois au démarrage. Si une variable obligatoire
 *   manque, le service s'arrête ici.
 */
const config = loadConfig()
/** @brief Dossier du disque où les fichiers sont rangés (un volume Docker). */
const { storageDir } = config
/**
 * @brief Connexion à la base PostgreSQL, limitée au schéma `media`. Elle est créée une fois et
 *   fermée à l'arrêt du serveur.
 */
const prisma = createPrisma(config.databaseUrl)
/**
 * @brief Objet qui lit et écrit en base les informations sur les fichiers (à qui ils appartiennent,
 *   leur type, leur taille...). Les fichiers eux-mêmes sont sur le disque.
 */
const assets = createAssetsRepository(prisma)
/** @brief Objet qui interroge catalog-service par HTTP. */
const catalog = createCatalogClient({
  baseUrl: config.catalogUrl,
  internalToken: config.internalServiceToken,
})
/**
 * @brief Fonction qui vérifie qu'un fichier envoyé est un vrai fichier audio ou une vraie image.
 * @details Une seule est créée pour tout le service, car elle ne traite qu'un fichier à la fois.
 */
const validate = createFileValidator()

// Avant d'accepter des requêtes : termine les envois et suppressions qu'un arrêt a interrompus.
await createUploadService({ storageDir, assets, validate }).recover()
await createFileDeletionService({ storageDir, assets, catalog }).recover()

/** @brief Serveur web prêt à écouter, construit avec les dépendances réelles. */
const app = await buildApp(config, {
  assets,
  catalog,
  validate,
  ready: () => prisma.$queryRaw`SELECT 1`,
  close: () => prisma.$disconnect(),
})

await app.listen({ port: config.port, host: '0.0.0.0' })
