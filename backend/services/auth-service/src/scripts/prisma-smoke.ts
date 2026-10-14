/**
 * @file prisma-smoke.ts
 * @brief Petite commande de vérification : `npm run prisma:smoke`.
 *
 * @details Elle se connecte à la base avec le compte du serveur, exécute la requête la plus simple
 *   possible (`SELECT 1`) et affiche un message de succès. Elle ne lit et n'écrit aucune donnée. La
 *   campagne de test `tests/per` la lance pour prouver que le compte du service a bien le droit de
 *   se connecter.
 */

import { createPrisma } from '../repositories/prisma.js'

/** @brief Adresse de la base à tester, lue dans la variable d'environnement du service. */
const url = process.env.AUTH_DATABASE_URL
if (!url) {
  throw new Error('AUTH_DATABASE_URL is required')
}

/** @brief Connexion ouverte pour le test, fermée à la fin quoi qu'il arrive. */
const prisma = createPrisma(url)
try {
  await prisma.$queryRaw`SELECT 1`
  console.log('auth-service Prisma connection: ok')
} finally {
  await prisma.$disconnect()
}
