/**
 * @file create-app.ts
 * @brief Création du serveur web de base, identique pour les six services.
 *
 * @details Fastify est la bibliothèque qui reçoit les requêtes HTTP et appelle notre code. Ce
 *   fichier crée un serveur Fastify déjà réglé comme le projet l'exige, pour qu'aucun service n'ait
 *   à le refaire : la validation des données reçues est stricte, chaque requête est chronométrée,
 *   et toutes les erreurs sont transformées en réponses de même format.
 *
 * Chaque service appelle `createApp` au début de son fichier app.ts, puis ajoute ses propres
 * routes.
 */

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import Fastify from 'fastify'
import { errorsPlugin, type FallbackError } from './plugins/errors.js'
import { metricsPlugin } from './plugins/metrics.js'

/** @brief Réglages qu'un service fournit pour créer son serveur. */
export type CreateAppOptions = {
  /**
   * @brief Nom du service, par exemple `library-service`. Il apparaît dans les réponses de
   *   `/health` et sert d'étiquette aux mesures lues par Prometheus.
   */
  service: string
  /**
   * @brief Réponse envoyée au client quand une erreur imprévue se produit (base en panne, bogue…).
   *   Chaque service a la sienne, par exemple `503 library_unavailable`. Le détail de l'erreur
   *   n'est jamais envoyé au client : il est écrit dans les journaux.
   */
  fallback: FallbackError
  /**
   * @brief Écrit ou non les journaux du serveur sur la sortie standard. Vrai par défaut ; les tests
   *   le désactivent pour garder un affichage lisible.
   */
  logger?: boolean
  /**
   * @brief Fastify crée automatiquement une route `HEAD` pour chaque route `GET`. Mettre faux
   *   désactive ce comportement ; media-service le fait car il déclare lui-même ses routes `HEAD`.
   */
  exposeHeadRoutes?: boolean
}

/**
 * @brief Réglage qui rend la validation des données reçues stricte.
 * @details Par défaut, Fastify est tolérant : il convertit le texte `"5"` en nombre `5`, et
 *   supprime en silence les champs qu'il ne connaît pas. Ce projet veut l'inverse : une valeur du
 *   mauvais type ou un champ en trop doit faire refuser la requête, pour qu'une erreur du client
 *   soit signalée au lieu d'être masquée. `coerceTypes: false` interdit la conversion,
 *   `removeAdditional: false` interdit la suppression silencieuse, `useDefaults: false` interdit de
 *   compléter une valeur manquante.
 */
const strictValidation = {
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
} as const

/**
 * @brief Crée le serveur web d'un service, avec les réglages communs à tout le backend.
 * @details Le serveur renvoyé a déjà : la validation stricte ; le chronométrage des requêtes
 *   (plugin de métriques) ; la gestion des erreurs (plugin d'erreurs). Il n'a encore aucune route :
 *   c'est au service de les ajouter.
 * @param options Nom du service, réponse en cas d'erreur imprévue, journaux, routes `HEAD`.
 * @returns Le serveur Fastify. Il est configuré pour déduire automatiquement les types TypeScript
 *   des requêtes à partir des schémas de validation.
 */
export function createApp(options: CreateAppOptions) {
  const { service, fallback, logger = true, exposeHeadRoutes = true } = options
  const app = Fastify({
    logger,
    exposeHeadRoutes,
    ajv: { customOptions: strictValidation },
  }).withTypeProvider<TypeBoxTypeProvider>()

  app.register(metricsPlugin, { service })
  app.register(errorsPlugin, { fallback })
  return app
}

/**
 * @brief Type du serveur web d'un service, tel que `createApp` le renvoie.
 * @details Les fichiers de routes reçoivent leur serveur sous ce type. C'est lui qui fait le lien
 *   entre un schéma de validation et le type TypeScript de `request.body`, `request.params` et
 *   `request.query` : si le schéma dit que le corps contient un champ `name` de type texte,
 *   TypeScript le sait aussi.
 */
export type App = ReturnType<typeof createApp>
