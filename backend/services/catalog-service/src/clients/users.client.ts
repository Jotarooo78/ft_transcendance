/** Identité du compte : Users reste la seule source du nom et de l’avatar. */
import { DomainError, fetchJson } from '@ft/service-kit'
import { isArtistProfile } from '../domain/artist.js'
/** Construit les lectures HTTP bornées de session et de profil public. */
export function createUsersClient(baseUrl: string) {
  return {
    /** Vérifie la session auprès de Users avant de réserver un audio. */
    async authenticate(authorization: string) {
      const response = await fetchJson(new URL('/me', baseUrl), {
        headers: { Authorization: authorization },
        timeoutMs: 5000,
      })
      if (response.status === 401) throw new DomainError(401, 'unauthorized')
      if (!response.ok || !isArtistProfile(response.body)) throw new Error('Profile unavailable')
      return response.body
    },
    /** Lit l’identité actuelle ; une panne n’invente jamais un nom d’artiste. */
    async read(id: string) {
      const response = await fetchJson(new URL(`/profiles/${id}`, baseUrl), { timeoutMs: 5000 })
      if (!response.ok || !isArtistProfile(response.body) || response.body.userId !== id)
        throw new Error('Artist profile unavailable')
      return response.body
    },
  }
}
/** Contrat injectable des accès à Users. */
export type UsersClient = ReturnType<typeof createUsersClient>
