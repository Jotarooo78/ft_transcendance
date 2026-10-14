/**
 * @file prisma.ts
 * @brief Création de la connexion à la base de données du service.
 *
 * @details Prisma est la bibliothèque qui permet de lire et d'écrire dans PostgreSQL depuis
 *   TypeScript. À partir de la description des tables (`prisma/schema.prisma`), elle génère du code
 *   dans `src/generated/prisma/` : c'est ce code généré, appelé « client », qu'on importe ici.
 *
 * Règle du projet : seuls les fichiers du dossier `repositories/` importent ce client. Le reste du
 * service (contrôleurs, services, domaine) ne sait pas que Prisma existe ; il passe par les
 * repositories. Ainsi, tout ce qui touche à la base est regroupé au même endroit.
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

/** @brief Type de la connexion à la base, tel que les repositories le reçoivent. */
export type Database = PrismaClient

/**
 * @brief Crée la connexion à la base de données.
 * @details Appelée une seule fois, dans server.ts. Les droits de cette connexion sont ceux du
 *   compte PostgreSQL contenu dans l'adresse : pour le serveur, un compte qui ne peut lire et
 *   écrire que dans le schéma du service.
 * @param connectionString Adresse complète de la base, de la forme
 *   `postgresql://compte:motdepasse@hôte:port/base`.
 * @returns Le client Prisma. Il faut appeler `$disconnect()` dessus à l'arrêt du serveur.
 */
export function createPrisma(connectionString: string): Database {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}
