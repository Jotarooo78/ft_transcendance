/** Confirmation durable d’un audio prêt appartenant au compte connecté. */
import { DomainError, fetchJson, isRecord } from '@ft/service-kit'
/** Construit le client interne de réservation, avec secret et délai explicites. */
export function createMediaClient(baseUrl: string, token: string) {
  return {
    /** Arbitre publication et suppression dans Media, sans partager sa base SQL. */
    async reserve(id: string, ownerId: string) {
      const response = await fetchJson(new URL(`/internal/assets/${id}/publication`, baseUrl), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: { ownerId },
        timeoutMs: 5000,
      })
      if (response.status === 409) throw new DomainError(409, 'audio_not_available')
      const audio = response.body
      if (
        !response.ok ||
        !isRecord(audio) ||
        audio.id !== id ||
        typeof audio.durationMs !== 'number' ||
        !Number.isSafeInteger(audio.durationMs) ||
        audio.durationMs <= 0
      )
        throw new Error('Invalid audio confirmation')
      return { id, durationMs: audio.durationMs }
    },
  }
}
/** Contrat injectable de réservation Media. */
export type MediaClient = ReturnType<typeof createMediaClient>
