/**
 * @file env.ts
 * @brief Configuration de media-service : variables d'environnement attendues et lecture de leurs
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
/** @brief Schéma d'une variable facultative : absente, ou un texte non vide. */
const optional = Type.Optional(required)

/**
 * @brief Description des variables d'environnement attendues.
 * @details `MEDIA_DATABASE_URL`, `JWT_SECRET` et `INTERNAL_SERVICE_TOKEN` sont obligatoires. `PORT`
 *   (4003 par défaut), `CATALOG_SERVICE_URL` et `MEDIA_STORAGE_DIR` (dossier des fichiers,
 *   `/data/audio` par défaut) sont facultatives.
 */
const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  MEDIA_DATABASE_URL: required,
  JWT_SECRET: required,
  INTERNAL_SERVICE_TOKEN: required,
  CATALOG_SERVICE_URL: optional,
  LIBRARY_SERVICE_URL: optional,
  MEDIA_STORAGE_DIR: optional,
})

/** @brief Configuration du service une fois lue et vérifiée. */
export type Config = {
  /** Library décide de la visibilité et de l’usage des images de playlist. */
  libraryUrl: string
  /** @brief Port d'écoute. */
  port: number
  /** @brief URL PostgreSQL du rôle `media_runtime`. */
  databaseUrl: string
  /** @brief Secret de vérification des JWT. */
  jwtSecret: string
  /** @brief Secret présenté au Catalogue sur sa route interne. */
  internalServiceToken: string
  /** @brief Adresse interne du Catalogue. */
  catalogUrl: string
  /** @brief Dossier du volume durable ; aucun chemin public ne doit le révéler. */
  storageDir: string
}

/**
 * @brief Port interne du service ; Compose ne le fournit pas, il fait partie du contrat avec Nginx.
 */
const defaultPort = 4003

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
    databaseUrl: env.MEDIA_DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    catalogUrl: env.CATALOG_SERVICE_URL ?? 'http://catalog-service:4002',
    libraryUrl: env.LIBRARY_SERVICE_URL ?? 'http://library-service:4004',
    storageDir: env.MEDIA_STORAGE_DIR ?? '/data/audio',
  }
}
