/**
 * @file catalog.client.ts
 * @brief Appels de playback-service vers catalog-service.
 *
 * @details Les services ne partagent pas de base de données. Playback enregistre les écoutes, mais
 *   c'est le catalogue qui connaît les morceaux. Pour ouvrir une session, Playback demande donc au
 *   catalogue, par HTTP, si le morceau existe et quelle est sa durée. Cette durée sert ensuite de
 *   plafond au temps d'écoute.
 *
 * Le dossier `clients/` regroupe ces appels vers d'autres services. Le fichier définit un type (les
 * questions qu'on peut poser) et une fonction qui en fournit la version réelle ; les tests
 * fournissent une fausse version.
 */

import { fetchJson, isRecord } from '@ft/service-kit'

/** @brief Liste des questions que playback-service pose au catalogue. */
export type CatalogClient = {
  /**
   * @brief Durée du morceau publié en millisecondes, ou null s'il n'existe pas ; rejette en cas de
   *   panne.
   */
  readTrackDuration: (trackId: string) => Promise<number | null>
}

/**
 * @brief Dit si une valeur reçue du catalogue est une durée utilisable.
 * @param value Valeur reçue.
 * @returns Vrai si c'est un nombre entier strictement positif.
 */
const isDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/**
 * @brief Crée le client du catalogue.
 * @param baseUrl Adresse de catalog-service sur le réseau interne, par exemple
 *   `http://catalog-service:4002`.
 * @param timeoutMs Durée maximale d'un appel en millisecondes ; 2 secondes si elle n'est pas
 *   précisée.
 * @returns Un objet offrant les questions de `CatalogClient`.
 */
export function createCatalogClient(baseUrl: string, timeoutMs?: number): CatalogClient {
  return {
    /**
     * @brief Demande au catalogue la durée d'un morceau publié.
     * @details Appelle `GET /tracks/<id>` sur le catalogue. Une réponse 404 signifie « ce morceau
     *   n'est pas visible » : c'est une réponse normale, qui donne null. Toute autre anomalie est
     *   traitée comme une panne.
     * @param trackId Identifiant du morceau.
     * @returns La durée en millisecondes, ou null si le morceau est inconnu ou en brouillon.
     * @throws {Error} Si le catalogue est injoignable, trop lent, ou renvoie une durée absente ou
     *   invalide. L'utilisateur reçoit alors `503 playback_unavailable`.
     */
    async readTrackDuration(trackId) {
      const response = await fetchJson(new URL(`/tracks/${trackId}`, baseUrl), { timeoutMs })
      if (response.status === 404) {
        return null
      }
      if (!response.ok) {
        throw new Error('Catalogue unavailable')
      }
      const track = response.body
      if (!isRecord(track) || track.id !== trackId || !isDuration(track.durationMs)) {
        throw new Error('Invalid track duration')
      }
      return track.durationMs
    },
  }
}
