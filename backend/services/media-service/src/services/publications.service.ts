/** Réservation avant publication et nettoyage borné des audios abandonnés. */
import { DomainError } from '@ft/service-kit'
import type { PublicationsRepository } from '../repositories/publications.repository.js'
import type { FileDeletionService } from './file-deletion.service.js'
/** Vérifie la réservation Media et garde la suppression commune comme seul chemin de nettoyage. */
export function createPublicationsService(
  store: PublicationsRepository,
  deletions: FileDeletionService
) {
  return {
    /** Confirme un audio du propriétaire, avec aperçu utilisable, avant l’écriture Catalogue. */
    async reserve(id: string, owner: string) {
      const audio = await store.reserve(id, owner)
      if (!audio) throw new DomainError(409, 'audio_not_available')
      return { id: audio.id, durationMs: Number(audio.durationMs), mimeType: 'audio/mpeg' }
    },
    /** Nettoie au plus cent envois ; une référence ou une réservation concurrente reste protégée. */
    async expire() {
      for (const asset of await store.expired()) {
        if (!asset.uploaderUserId) continue
        try {
          await deletions.remove(asset.uploaderUserId, asset.id)
        } catch (error) {
          if (!(error instanceof DomainError) || error.status !== 409) throw error
        }
      }
    },
  }
}
/** Contrat des opérations injectées dans les contrôleurs. */
export type PublicationsService = ReturnType<typeof createPublicationsService>
