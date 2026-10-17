/**
 * @file catalog.client.ts
 * @brief Appels de chat-service vers catalog-service.
 *
 * @details Un message peut partager un morceau. Chat ne garde que l'identifiant de ce morceau : c'est
 *   le catalogue qui sait s'il existe et s'il est publié. Avant d'enregistrer un partage, chat-service
 *   lui pose donc la question par HTTP, sur la route publique `GET /tracks/:id`. Un morceau en
 *   brouillon n'y est pas visible : on ne peut donc partager que ce que tout le monde peut écouter.
 *
 * Même organisation que users.client.ts : un type (les questions qu'on peut poser) et une fonction
 * qui en fournit la version réelle ; les tests fournissent une fausse version.
 */

import { fetchJson, isRecord } from '@ft/service-kit'

/** @brief Liste des questions que chat-service pose au catalogue. */
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
     * @details Appelle `GET /tracks/<id>`. Une réponse 404 signifie « ce morceau n'est pas visible » :
     *   c'est une réponse normale, qui donne faux. Toute autre anomalie est traitée comme une panne :
     *   dans le doute, on refuse le partage plutôt que d'enregistrer un morceau non vérifié.
     * @param trackId Identifiant du morceau.
     * @returns Vrai si le morceau est publié ; faux s'il est inconnu ou en brouillon.
     * @throws {Error} Si le catalogue est injoignable, trop lent, ou renvoie une réponse
     *   inattendue. L'utilisateur reçoit alors `503 chat_unavailable`.
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
