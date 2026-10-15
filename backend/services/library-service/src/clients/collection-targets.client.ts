import { fetchJson, isRecord } from '@ft/service-kit'
import type { CollectionKind } from '../domain/collection.js'
/** @brief Vérification des cibles appartenant à un autre service. */
export type CollectionTargets = {
  exists: (kind: Exclude<CollectionKind, 'playlist'>, id: string) => Promise<boolean>
}
/** @brief Vérifie les seules projections publiques, avec délai et contrôle d'identité. */
export function createCollectionTargets(catalogUrl: string, usersUrl: string): CollectionTargets {
  return {
    /** @brief Distingue une absence publique d’une panne de service. */
    async exists(kind, id) {
      const url =
        kind === 'artist'
          ? new URL(`/profiles/${id}`, usersUrl)
          : new URL(`/${kind === 'track' ? 'tracks' : 'projects'}/${id}`, catalogUrl)
      const response = await fetchJson(url, { timeoutMs: 2000 })
      if (response.status === 404) return false
      if (
        !response.ok ||
        !isRecord(response.body) ||
        response.body[kind === 'artist' ? 'userId' : 'id'] !== id
      )
        throw new Error('Target unavailable')
      return true
    },
  }
}
