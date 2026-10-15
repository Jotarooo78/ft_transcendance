/** Associe une image Media confirmée à une playlist, sans partager son stockage ni sa base. */
import { DomainError, fetchJson, isRecord } from '@ft/service-kit'
import type { Database } from '../repositories/prisma.js'
import { withLockedPlaylist, type PlaylistKey } from '../repositories/playlist-lock.js'
import { playlistNotFound, versionConflict } from '../domain/errors.js'
import { toPlaylist } from '../domain/playlist.js'
/** Réserve avant d’écrire ; une réservation abandonnée sera nettoyée par Media après vérification. */
export function createPlaylistArtworkService(prisma: Database, mediaUrl: string, token: string) {
  return {
    /** Ne révèle que l’existence d’une référence, sur une route interne protégée. */
    async referenced(id: string) {
      return !!(await prisma.playlist.findFirst({
        where: { coverAssetId: id },
        select: { id: true },
      }))
    },
    /** Remplace ou retire l’image sans modifier le nom, les titres ni leur ordre. */
    async set(key: PlaylistKey, assetId: string | null) {
      const current = await prisma.playlist.findFirst({
        where: { id: key.id, ownerUserId: key.owner },
      })
      if (!current) throw playlistNotFound()
      if (current.version !== BigInt(key.expectedVersion)) throw versionConflict()
      if (assetId) {
        const r = await fetchJson(
          new URL(`/internal/playlist-images/${assetId}/reservation`, mediaUrl),
          {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
            body: { owner: key.owner, playlistId: key.id },
            timeoutMs: 10000,
          }
        )
        if (r.status === 409) throw new DomainError(409, 'image_unavailable')
        if (!r.ok || !isRecord(r.body) || r.body.id !== assetId)
          throw new Error('Media unavailable')
      }
      return toPlaylist(
        await withLockedPlaylist(prisma, key, (tx) =>
          tx.playlist.update({
            where: { id: key.id },
            data: { coverAssetId: assetId, version: { increment: 1 } },
            include: { items: { orderBy: { position: 'asc' } } },
          })
        )
      )
    },
  }
}
