/** Publication : validation, identité Users, réservation Media puis écriture Catalogue. */
import { DomainError } from '@ft/service-kit'
import { parsePublication } from '../domain/publication.js'
import type { UsersClient } from '../clients/users.client.js'
import type { MediaClient } from '../clients/media.client.js'
import type { PublicationsRepository } from '../repositories/publications.repository.js'
import type { TracksService } from './tracks.service.js'
/** Assemble les dépendances sans connaître HTTP ni Prisma. */
export function createPublicationsService(
  users: UsersClient,
  media: MediaClient,
  publications: PublicationsRepository,
  tracks: TracksService
) {
  return {
    /** Une réservation reste durable si Catalogue tombe ; le même audio permet de reprendre. */
    async publish(authorization: string | undefined, body: unknown) {
      if (!authorization?.startsWith('Bearer ')) throw new DomainError(401, 'unauthorized')
      const data = parsePublication(body)
      if (!data) throw new DomainError(400, 'invalid_publication')
      const profile = await users.authenticate(authorization)
      const audio = await media.reserve(data.audioAssetId, profile.userId)
      const track = await publications.publish(data, profile.userId, audio.durationMs)
      if (track.createdByUserId !== profile.userId || track.audioAssetId !== data.audioAssetId)
        throw new DomainError(409, 'publication_conflict')
      return tracks.get(track.id)
    },
  }
}
/** Opérations métier de publication. */
export type PublicationsService = ReturnType<typeof createPublicationsService>
