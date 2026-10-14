/**
 * @file env.ts
 * @brief Configuration de catalog-service : liste des variables d'environnement dont il a besoin et
 *   lecture de leurs valeurs.
 *
 * @details Les réglages d'un service (adresse de la base, secrets) ne sont pas écrits dans le code
 *   : ils sont fournis au démarrage par des variables d'environnement, définies dans le fichier
 *   `.env` à la racine du dépôt et transmises par Docker Compose. Ce fichier décrit lesquelles sont
 *   attendues et les transforme en un objet `Config` typé, que le reste du service utilise. Pour
 *   ajouter un réglage, c'est ici qu'il faut commencer.
 */

import { readEnv } from '@ft/service-kit'
import { Type } from 'typebox'

/**
 * @brief Description des variables d'environnement attendues, sous forme de schéma de validation.
 * @details `PORT` est facultatif (le service a un port par défaut) ; `CATALOG_DATABASE_URL` et
 *   `INTERNAL_SERVICE_TOKEN` sont obligatoires et ne peuvent pas être vides.
 */
const EnvSchema = Type.Object({
  PORT: Type.Optional(Type.String({ pattern: '^[0-9]+$' })),
  CATALOG_DATABASE_URL: Type.String({ minLength: 1 }),
  INTERNAL_SERVICE_TOKEN: Type.String({ minLength: 1 }),
})

/**
 * @brief Configuration du service une fois lue et vérifiée.
 * @details `port` : port sur lequel le serveur écoute. `databaseUrl` : adresse de connexion à
 *   PostgreSQL, qui contient le compte `catalog_runtime` autorisé à lire et écrire uniquement dans
 *   le schéma `catalog`. `internalServiceToken` : secret qu'un autre service doit présenter pour
 *   appeler une route `/internal/...`.
 */
export type Config = { port: number; databaseUrl: string; internalServiceToken: string }

/**
 * @brief Port utilisé quand la variable `PORT` n'est pas définie.
 * @details Docker Compose ne définit pas `PORT` : ce numéro est donc celui que Nginx et Prometheus
 *   contactent. Le changer ici imposerait de le changer aussi dans nginx.conf, prometheus.yml et
 *   les Dockerfile.
 */
const defaultPort = 4002

/**
 * @brief Lit les variables d'environnement et renvoie la configuration du service.
 * @param source Variables à lire. Par défaut celles du processus ; les tests peuvent en passer
 *   d'autres.
 * @returns La configuration, avec le port converti en nombre.
 * @throws {Error} Si une variable obligatoire manque ou est mal formée. Le message nomme la
 *   variable en cause.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const env = readEnv(EnvSchema, source)
  return {
    port: Number(env.PORT ?? defaultPort),
    databaseUrl: env.CATALOG_DATABASE_URL,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
  }
}
