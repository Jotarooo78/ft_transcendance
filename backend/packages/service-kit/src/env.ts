/**
 * @file env.ts
 * @brief Lecture et vérification des variables d'environnement.
 *
 * @details Les réglages d'un service (adresse de la base, secrets, adresses des autres services)
 *   lui sont donnés au démarrage sous forme de variables d'environnement. Si l'une manque, mieux
 *   vaut que le service refuse de démarrer avec un message clair, plutôt que de planter plus tard à
 *   la première requête.
 *
 * Chaque service décrit ses variables dans son fichier `config/env.ts` et les lit avec la fonction
 * de ce fichier.
 */

import type { Static, TSchema } from 'typebox'
import { Value } from 'typebox/value'

/**
 * @brief Vérifie que les variables d'environnement correspondent à ce que le service attend.
 * @param schema Description des variables attendues : lesquelles sont obligatoires, quelle forme
 *   elles doivent avoir.
 * @param source Variables à vérifier. Par défaut celles du processus ; un test peut en fournir
 *   d'autres.
 * @returns Les variables, avec des types TypeScript déduits de la description.
 * @throws {Error} Si une variable obligatoire manque ou est mal formée. Le message, par exemple
 *   `Invalid environment: / must have required properties JWT_SECRET`, nomme la variable en cause.
 */
export function readEnv<T extends TSchema>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env
): Static<T> {
  const [issue] = Value.Errors(schema, source)
  if (issue) {
    throw new Error(`Invalid environment: ${issue.instancePath || '/'} ${issue.message}`)
  }
  return source as Static<T>
}
