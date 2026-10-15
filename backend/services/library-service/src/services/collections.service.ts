import { DomainError, type Pagination } from '@ft/service-kit'
import type { CollectionKind } from '../domain/collection.js'
import type { CollectionTargets } from '../clients/collection-targets.client.js'
import type { CollectionsRepository } from '../repositories/collections.repository.js'
import type { PlaylistsRepository } from '../repositories/playlists.repository.js'
/** @brief Enregistre uniquement des cibles publiques ; aucune copie de contenu privé. */
export function createCollectionsService(
  repository: CollectionsRepository,
  targets: CollectionTargets,
  playlists: PlaylistsRepository
) {
  return {
    /** @brief Liste les références du compte authentifié. */
    async list(owner: string, kind: CollectionKind, pagination: Pagination) {
      return { ...pagination, ...(await repository.list(owner, kind, pagination)) }
    },
    /** @brief Valide l'existence publique avant l'ajout personnel. */
    async save(owner: string, kind: CollectionKind, id: string) {
      const exists =
        kind === 'playlist' ? await playlists.findPublic(id) : await targets.exists(kind, id)
      if (!exists) throw new DomainError(404, 'target_not_found')
      await repository.save(owner, kind, id)
    },
    /** @brief Supprime seulement la référence appartenant au demandeur. */
    remove: (owner: string, kind: CollectionKind, id: string) => repository.remove(owner, kind, id),
  }
}
/** @brief Contrat injecté au contrôleur. */
export type CollectionsService = ReturnType<typeof createCollectionsService>
