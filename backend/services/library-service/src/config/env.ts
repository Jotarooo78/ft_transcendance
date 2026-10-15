/**
 * @file env.ts
 * @brief Configuration de library-service : variables d'environnement attendues et lecture de leurs
 *   valeurs.
 *
 * @details Les réglages du service ne sont pas écrits dans le code. Ils viennent de variables
 *   d'environnement, définies dans le fichier `.env` à la racine du dépôt et transmises par Docker
 *   Compose. Ce fichier dit lesquelles sont attendues et les transforme en un objet `Config`. Pour
 *   ajouter un réglage, commence ici.
 */

import { readEnv } from '@ft/service-kit'
import { Type } from 'typebox'

/**
 * @brief Description des variables d'environnement attendues.
 * @details `LIBRARY_DATABASE_URL` et `JWT_SECRET` sont obligatoires. `PORT` et
 *   `CATALOG_SERVICE_URL` sont facultatives et ont une valeur par défaut.
 */
const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  LIBRARY_DATABASE_URL: Type.String({ minLength: 1 }),
  JWT_SECRET: Type.String({ minLength: 1 }),
  USER_SERVICE_URL: Type.Optional(Type.String({ minLength: 1 })),
  CATALOG_SERVICE_URL: Type.Optional(Type.String({ minLength: 1 })),
})

/**
 * @brief Configuration du service une fois lue et vérifiée.
 * @details `port` : port d'écoute. `databaseUrl` : adresse de PostgreSQL, avec le compte
 *   `library_runtime` qui ne peut lire et écrire que dans le schéma `library`. `jwtSecret` : secret
 *   servant à vérifier les jetons de connexion, identique dans tous les services. `catalogUrl` :
 *   adresse de catalog-service sur le réseau interne.
 */
export type Config = {
  port: number
  databaseUrl: string
  jwtSecret: string
  catalogUrl: string
  usersUrl: string
}

/**
 * @brief Port utilisé quand `PORT` n'est pas définie. Docker Compose ne la définit pas : c'est donc
 *   le port que Nginx et Prometheus contactent.
 */
const defaultPort = 4004
/**
 * @brief Adresse de catalog-service sur le réseau Docker, utilisée quand `CATALOG_SERVICE_URL`
 *   n'est pas définie.
 */
const defaultCatalogUrl = 'http://catalog-service:4002'

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
    databaseUrl: env.LIBRARY_DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    usersUrl: env.USER_SERVICE_URL ?? 'http://user-service:4001',
    catalogUrl: env.CATALOG_SERVICE_URL ?? defaultCatalogUrl,
  }
}
