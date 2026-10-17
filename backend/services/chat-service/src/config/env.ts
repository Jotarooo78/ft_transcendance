/**
 * @file env.ts
 * @brief Configuration de chat-service : variables d'environnement attendues et lecture de leurs
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
 * @details `CHAT_DATABASE_URL`, `JWT_SECRET` et `INTERNAL_SERVICE_TOKEN` sont obligatoires. `PORT`,
 *   `USER_SERVICE_URL` et `CATALOG_SERVICE_URL` sont facultatives et ont une valeur par défaut.
 */
const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  CHAT_DATABASE_URL: Type.String({ minLength: 1 }),
  JWT_SECRET: Type.String({ minLength: 1 }),
  INTERNAL_SERVICE_TOKEN: Type.String({ minLength: 1 }),
  USER_SERVICE_URL: Type.Optional(Type.String({ minLength: 1 })),
  CATALOG_SERVICE_URL: Type.Optional(Type.String({ minLength: 1 })),
})

/**
 * @brief Configuration du service une fois lue et vérifiée.
 * @details `port` : port d'écoute. `databaseUrl` : adresse de PostgreSQL, avec le compte
 *   `chat_runtime` qui ne peut lire et écrire que dans le schéma `chat`. `jwtSecret` : secret servant à
 *   vérifier les jetons de connexion, identique dans tous les services. `internalServiceToken` :
 *   secret présenté à user-service pour ses routes `/internal`. `usersUrl` : adresse de user-service
 *   sur le réseau interne. `catalogUrl` : adresse de catalog-service, interrogé avant de partager un
 *   morceau.
 */
export type Config = {
  port: number
  databaseUrl: string
  jwtSecret: string
  internalServiceToken: string
  usersUrl: string
  catalogUrl: string
}

/**
 * @brief Port utilisé quand `PORT` n'est pas définie. Docker Compose ne la définit pas : c'est donc
 *   le port que Nginx et Prometheus contactent.
 */
const defaultPort = 4006
/**
 * @brief Adresse de user-service sur le réseau Docker, utilisée quand `USER_SERVICE_URL` n'est pas
 *   définie.
 */
const defaultUsersUrl = 'http://user-service:4001'
/**
 * @brief Adresse de catalog-service sur le réseau Docker, utilisée quand `CATALOG_SERVICE_URL` n'est
 *   pas définie.
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
    databaseUrl: env.CHAT_DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    usersUrl: env.USER_SERVICE_URL ?? defaultUsersUrl,
    catalogUrl: env.CATALOG_SERVICE_URL ?? defaultCatalogUrl,
  }
}
