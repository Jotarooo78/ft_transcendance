/**
 * @file prisma.migration.config.ts
 * @brief Réglages des commandes Prisma qui modifient la structure de la base (`npm run
 *   prisma:migrate:deploy` et `npm run prisma:migrate:dev`).
 *
 * @details Une « migration » est un fichier SQL qui crée ou modifie des tables. Ce fichier indique
 *   à Prisma où se trouvent la description des tables (`prisma/schema.prisma`), le dossier des
 *   migrations (`prisma/migrations`) et avec quel compte PostgreSQL se connecter.
 *
 * Ce compte est le compte « de migration » du service, qui a le droit de modifier les tables. Il
 * est différent du compte utilisé par le serveur en fonctionnement, qui ne peut que lire et écrire
 * des lignes. Dans Docker, son adresse est fournie par une variable d'environnement ; en dehors de
 * Docker, elle est lue dans le fichier `.env` à la racine du dépôt.
 *
 * Charger ce fichier ne modifie rien dans la base. Voir backend/docs/PRISMA.md pour le détail des
 * commandes.
 */

import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { defineConfig, env } from 'prisma/config'

if (!process.env.LIBRARY_MIGRATION_DATABASE_URL) {
  loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('LIBRARY_MIGRATION_DATABASE_URL') },
})
