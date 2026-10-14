/**
 * @file env.ts
 * @brief Configuration de auth-service : variables d'environnement attendues et lecture de leurs
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
/** @brief Schéma d'un nombre entier d'au moins 1, écrit en chiffres. */
const positiveInteger = Type.String({ pattern: '^[1-9][0-9]*$' })

/**
 * @brief Description des variables d'environnement attendues.
 * @details `AUTH_DATABASE_URL`, `JWT_SECRET` et `INTERNAL_SERVICE_TOKEN` sont obligatoires. `PORT`
 *   (4000 par défaut), `USER_SERVICE_URL`, `AUTH_SIGNUP_RATE_LIMIT` et `AUTH_LOGIN_RATE_LIMIT` sont
 *   facultatives.
 */
const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  AUTH_DATABASE_URL: required,
  JWT_SECRET: required,
  INTERNAL_SERVICE_TOKEN: required,
  USER_SERVICE_URL: Type.Optional(required),
  AUTH_SIGNUP_RATE_LIMIT: Type.Optional(positiveInteger),
  AUTH_LOGIN_RATE_LIMIT: Type.Optional(positiveInteger),
})

/** @brief Configuration du service une fois lue et vérifiée. */
export type Config = {
  /** @brief Port d'écoute. */
  port: number
  /** @brief URL PostgreSQL du rôle `auth_runtime`. */
  databaseUrl: string
  /**
   * @brief Secret de signature des JWT ; les cinq autres services le partagent pour les vérifier.
   */
  jwtSecret: string
  /** @brief Secret présenté à Users sur sa route interne. */
  internalServiceToken: string
  /** @brief Adresse interne de user-service. */
  usersUrl: string
  /** @brief Limites de débit de l'inscription et de la connexion. */
  rateLimits: RateLimits
}

/**
 * @brief Nombre maximal de requêtes d'inscription et de connexion acceptées par minute depuis une
 *   même adresse.
 * @details Ces limites freinent quelqu'un qui essaierait des milliers de mots de passe. Une limite
 *   non définie n'est pas appliquée : c'est le cas par défaut. Attention : derrière Nginx, toutes
 *   les requêtes semblent venir de la même adresse, donc la limite est partagée par tous les
 *   utilisateurs.
 */
export type RateLimits = { signupPerMinute?: number; loginPerMinute?: number }

/**
 * @brief Convertit en nombre une limite lue dans une variable d'environnement.
 * @param value Texte de la variable, ou rien si elle n'est pas définie.
 * @returns Le nombre, ou rien si la variable n'est pas définie.
 */
const toLimit = (value: string | undefined) => (value === undefined ? undefined : Number(value))

/**
 * @brief Port interne du service ; Compose ne le fournit pas, il fait partie du contrat avec Nginx.
 */
const defaultPort = 4000

/**
 * @brief Lit les variables d'environnement et renvoie la configuration du service.
 * @param source Variables à lire ; par défaut celles du processus.
 * @returns La configuration, avec le port et les limites convertis en nombres.
 * @throws {Error} Si une variable obligatoire manque ou est mal formée ; le message la nomme.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const env = readEnv(EnvSchema, source)
  return {
    port: Number(env.PORT ?? defaultPort),
    databaseUrl: env.AUTH_DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    usersUrl: env.USER_SERVICE_URL ?? 'http://user-service:4001',
    rateLimits: {
      signupPerMinute: toLimit(env.AUTH_SIGNUP_RATE_LIMIT),
      loginPerMinute: toLimit(env.AUTH_LOGIN_RATE_LIMIT),
    },
  }
}
