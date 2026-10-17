/**
 * @file helpers.ts
 * @brief Outils partagés par les tests de catalog-service.
 *
 * @details Les tests ne démarrent ni base de données ni serveur réseau. Ils construisent le serveur
 *   avec `buildApp` en lui donnant de faux repositories, puis lui envoient des requêtes en mémoire
 *   avec `app.inject`. Ce fichier fournit la configuration de test, des données d'exemple et une
 *   fonction qui construit ce serveur de test.
 */

import { buildApp, type Dependencies } from '../src/app.js'
import type { TrackRow } from '../src/domain/track.js'

/** @brief Configuration utilisée par les tests ; l'adresse de base n'est jamais contactée. */
export const config = {
  port: 0,
  databaseUrl: 'unused',
  internalServiceToken: 'internal-test-token',
}

/** @brief Identifiant du morceau d'exemple. */
export const trackId = '20000000-0000-4000-8000-000000000001'

/** @brief Morceau d'exemple, sous la forme que la base renverrait. */
export const row: TrackRow = {
  id: trackId,
  title: 'Aube',
  artistName: 'Atelier Demo',
  albumTitle: '',
  genre: 'Demo',
  durationMs: 6000n,
  audioAssetId: '30000000-0000-4000-8000-000000000001',
}

/**
 * @brief Faux accès à la base qui échoue s'il est appelé.
 * @details Il sert de valeur par défaut : si une route appelle une opération que le test n'avait
 *   pas prévue, le test échoue au lieu de passer par hasard.
 */
const unused = async (): Promise<never> => {
  throw new Error('Unexpected storage call')
}

/**
 * @brief Construit un serveur de test.
 * @param overrides Faux repositories ou réglages que le test veut contrôler ; tout le reste échoue
 *   s'il est appelé.
 * @returns Le serveur, à interroger avec `app.inject(...)` et à fermer avec `app.close()`.
 */
export function buildTestApp(overrides: Partial<Dependencies> = {}) {
  return buildApp(config, {
    users: { authenticate: unused, read: unused },
    media: { reserve: unused, release: unused },
    publications: { owners: async () => [], publish: unused },
    tracks: { findPublished: unused, list: unused },
    assets: { isPublished: unused, isReferenced: unused },
    ready: async () => undefined,
    logger: false,
    ...overrides,
  })
}
