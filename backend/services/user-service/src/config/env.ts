/**
 * @file env.ts
 * @brief Configuration de user-service : variables d'environnement attendues et lecture de leurs
 *   valeurs.
 *
 * @details Les réglages du service ne sont pas écrits dans le code. Ils viennent de variables
 *   d'environnement, définies dans le fichier `.env` à la racine du dépôt et transmises par Docker
 *   Compose. Ce fichier dit lesquelles sont attendues et les transforme en un objet `Config`. Pour
 *   ajouter un réglage, commence ici.
 */

import { readEnv } from '@ft/service-kit'
import { Type } from 'typebox'

/** @brief Schéma d'une variable obligatoire : un texte non vide. */
const required = Type.String({ minLength: 1 })

/**
 * @brief Description des variables d'environnement attendues.
 * @details `USER_DATABASE_URL`, `JWT_SECRET` et `INTERNAL_SERVICE_TOKEN` sont obligatoires. `PORT`
 *   (4001 par défaut) et `AVATAR_STORAGE_DIR` (dossier des avatars) sont facultatives.
 */
const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  USER_DATABASE_URL: required,
  JWT_SECRET: required,
  INTERNAL_SERVICE_TOKEN: required,
  AVATAR_STORAGE_DIR: Type.Optional(required),
})

/** @brief Configuration du service une fois lue et vérifiée. */
export type Config = {
  /** @brief Port d'écoute. */
  port: number
  /** @brief URL PostgreSQL du rôle `users_runtime`. */
  databaseUrl: string
  /** @brief Secret de vérification des JWT. */
  jwtSecret: string
  /** @brief Secret exigé sur la route interne appelée par Auth. */
  internalServiceToken: string
  /** @brief Dossier du volume des avatars. */
  avatarStorageDir: string
}

/**
 * @brief Port interne du service ; Compose ne le fournit pas, il fait partie du contrat avec Nginx.
 */
const defaultPort = 4001

/**
 * @brief Lit les variables d'environnement et renvoie la configuration du service.
 * @param source Variables à lire ; par défaut celles du processus.
 * @returns La configuration, avec le port converti en nombre.
 * @throws {Error} Si une variable obligatoire manque ou est mal formée ; le message la nomme.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const env = readEnv(EnvSchema, source)
  return {
    port: Number(env.PORT ?? defaultPort),
    databaseUrl: env.USER_DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    avatarStorageDir: env.AVATAR_STORAGE_DIR ?? '/tmp/user-service-avatars',
  }
}
