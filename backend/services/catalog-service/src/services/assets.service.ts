/**
 * @file assets.service.ts
 * @brief Réponses aux deux questions que media-service pose sur un fichier.
 *
 * @details Ce service ne contient presque aucune règle : il transmet la question au repository
 *   après avoir mis l'identifiant en minuscules. Il existe pour que le catalogue garde la même
 *   structure que les autres services (route → contrôleur → service → repository) et pour offrir un
 *   endroit où ajouter une règle le jour où il en faudra une.
 */

import type { AssetsRepository } from '../repositories/assets.repository.js'

/** @brief Type de l'objet renvoyé par `createAssetsService`. */
export type AssetsService = ReturnType<typeof createAssetsService>

/**
 * @brief Crée le service des références de fichiers.
 * @param assets Repository qui cherche le fichier dans les tables du catalogue.
 * @returns Un objet offrant `isPublished` (« cet audio appartient-il à un morceau publié ? ») et
 *   `isReferenced` (« ce fichier est-il encore utilisé ? »).
 */
export function createAssetsService(assets: AssetsRepository) {
  return {
    isPublished: (assetId: string) => assets.isPublished(assetId.toLowerCase()),
    isReferenced: (assetId: string) => assets.isReferenced(assetId.toLowerCase()),
  }
}
