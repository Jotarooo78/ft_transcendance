/**
 * @file catalog.client.ts
 * @brief Appels de library-service vers catalog-service.
 *
 * @details Les services ne partagent pas de base de données. Library stocke les playlists, mais
 *   c'est le catalogue qui connaît les morceaux. Avant d'ajouter un morceau à une playlist, Library
 *   demande donc au catalogue, par HTTP, si ce morceau existe et est publié.
 *
 * Le dossier `clients/` regroupe ces appels vers d'autres services. Comme pour les repositories, le
 * fichier définit un type (les questions qu'on peut poser) et une fonction qui en fournit la
 * version réelle ; les tests fournissent une fausse version.
 */

import { fetchJson, isRecord } from '@ft/service-kit'

/** @brief Liste des questions que library-service pose au catalogue. */
export type CatalogClient = {
  /** @brief Demande au catalogue si un morceau existe et est publié. */
  isTrackPublished: (trackId: string) => Promise<boolean>
}

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
     * @brief Demande au catalogue si un morceau est publié.
     * @details Appelle `GET /tracks/<id>` sur le catalogue. Une réponse 404 signifie « ce morceau
     *   n'est pas visible » : c'est une réponse normale, qui donne faux. Toute autre anomalie est
     *   traitée comme une panne : dans le doute, on préfère refuser l'ajout plutôt que d'ajouter un
     *   morceau non vérifié.
     * @param trackId Identifiant du morceau.
     * @returns Vrai si le morceau est publié ; faux s'il est inconnu ou en brouillon.
     * @throws {Error} Si le catalogue est injoignable, trop lent, ou renvoie une réponse
     *   inattendue. L'utilisateur reçoit alors `503 library_unavailable`.
     */
    async isTrackPublished(trackId) {
      const response = await fetchJson(new URL(`/tracks/${trackId}`, baseUrl), { timeoutMs })
      if (response.status === 404) {
        return false
      }
      if (!response.ok) {
        throw new Error('Catalogue unavailable')
      }
      if (!isRecord(response.body) || response.body.id !== trackId) {
        throw new Error('Invalid track response')
      }
      return true
    },
  }
}
