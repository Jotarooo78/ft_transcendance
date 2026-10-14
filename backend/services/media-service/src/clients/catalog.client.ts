/**
 * @file catalog.client.ts
 * @brief Appels de media-service vers catalog-service.
 *
 * @details Media stocke les fichiers, mais c'est le catalogue qui sait à quoi ils servent. Media
 *   lui pose deux questions par HTTP. « Ce fichier audio est-il celui d'un morceau publié ? » :
 *   seul un morceau publié peut être écouté publiquement. « Ce fichier est-il encore utilisé
 *   quelque part ? » : un fichier utilisé ne doit pas être supprimé.
 *
 * La seconde question passe par une route interne du catalogue, protégée par un secret partagé
 * entre services (`INTERNAL_SERVICE_TOKEN`).
 */

import { fetchJson, isRecord } from '@ft/service-kit'

/** @brief Liste des questions que media-service pose au catalogue. */
export type CatalogClient = {
  /** @brief Vrai si un morceau publié utilise cet audio ; rejette si le Catalogue ne répond pas. */
  isAssetPublished: (assetId: string) => Promise<boolean>
  /**
   * @brief Vrai si le Catalogue utilise encore ce fichier, brouillons compris ; rejette en cas de
   *   doute.
   */
  isAssetReferenced: (assetId: string) => Promise<boolean>
}

/**
 * @brief Réglages du client : adresse du catalogue, secret partagé et durée maximale d'un appel.
 */
type Options = { baseUrl: string; internalToken: string; timeoutMs?: number }

/**
 * @brief Appelle le catalogue et lit dans sa réponse une valeur vrai/faux.
 * @param url Adresse appelée.
 * @param field Nom du champ attendu dans la réponse.
 * @param timeoutMs Durée maximale de l'appel, en millisecondes.
 * @param headers En-têtes HTTP à envoyer.
 * @returns La valeur du champ.
 * @throws {Error} Si le catalogue ne répond pas correctement ou si le champ n'est pas un vrai/faux.
 *   Dans le doute, l'opération en cours est refusée.
 */
async function readFlag(
  url: URL,
  field: string,
  timeoutMs?: number,
  headers?: Record<string, string>
) {
  const response = await fetchJson(url, { timeoutMs, headers })
  if (!response.ok) {
    throw new Error('Catalogue unavailable')
  }
  const flag = isRecord(response.body) ? response.body[field] : undefined
  if (typeof flag !== 'boolean') {
    throw new Error(`Invalid ${field} response`)
  }
  return flag
}

/**
 * @brief Crée le client du catalogue.
 * @param options Adresse, secret partagé et durée maximale d'un appel.
 * @returns Un objet offrant les questions de `CatalogClient`.
 * @throws {Error} Si le secret partagé est vide.
 */
export function createCatalogClient({ baseUrl, internalToken, timeoutMs }: Options): CatalogClient {
  if (!internalToken.trim()) {
    throw new Error('INTERNAL_SERVICE_TOKEN is required')
  }
  const authorization = { Authorization: `Bearer ${internalToken}` }

  return {
    isAssetPublished: (assetId) =>
      readFlag(new URL(`/assets/${assetId}/publication`, baseUrl), 'published', timeoutMs),

    isAssetReferenced: (assetId) =>
      readFlag(
        new URL(`/internal/assets/${assetId}/references`, baseUrl),
        'referenced',
        timeoutMs,
        authorization
      ),
  }
}
