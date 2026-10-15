/** Images de playlist : même validation et stockage que les fichiers Media, avec accès décidé par Library. */
import { DomainError, fetchJson, isRecord } from '@ft/service-kit'
import type { Database } from '../repositories/prisma.js'
import type { UploadService, Receive } from './upload.service.js'
import type { FileDeletionService } from './file-deletion.service.js'
import { openStoredFile } from '../storage/stored-file.js'
import { imageByteLimit } from '../domain/limits.js'

/** Crée les opérations d’image ; aucun accès au schéma SQL de Library. */
export function createPlaylistImagesService(
  database: Database,
  uploads: UploadService,
  deletions: FileDeletionService,
  storageDir: string,
  libraryUrl: string,
  token: string
) {
  /** Demande si Library référence encore le fichier ; une panne empêche le nettoyage. */
  async function referenced(id: string) {
    const r = await fetchJson(new URL(`/internal/playlist-images/${id}/reference`, libraryUrl), {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: 5000,
    })
    if (!r.ok || !isRecord(r.body) || typeof r.body.referenced !== 'boolean')
      throw new Error('Library unavailable')
    return r.body.referenced
  }
  return {
    /** Envoie une image provisoire ; les images abandonnées sont nettoyées après 24 heures. */
    async upload(owner: string, receive: Receive, signal: AbortSignal) {
      const image = await uploads.save(
        owner,
        receive,
        signal,
        new Date(Date.now() + 86400000),
        'image'
      )
      return { id: image.id }
    },
    /** Réserve uniquement une image prête du propriétaire pour cette playlist. */
    async reserve(id: string, owner: string, playlistId: string) {
      const result = await database.asset.updateMany({
        where: {
          id,
          uploaderUserId: owner,
          purpose: 'cover',
          state: 'ready',
          OR: [{ playlistId: null, expiresAt: { gt: new Date() } }, { playlistId }],
        },
        data: { playlistId, expiresAt: new Date(Date.now() + 86400000) },
      })
      if (!result.count) throw new DomainError(409, 'image_unavailable')
      return { id }
    },
    /** Sert l’image uniquement si elle est encore la pochette d’une playlist publique. */
    async open(playlistId: string) {
      const r = await fetchJson(new URL(`/public/playlists/${playlistId}`, libraryUrl), {
        timeoutMs: 5000,
      })
      if (r.status === 404) throw new DomainError(404, 'image_not_found')
      if (!r.ok || !isRecord(r.body)) throw new Error('Library unavailable')
      const id = r.body.coverAssetId
      if (typeof id !== 'string') throw new DomainError(404, 'image_not_found')
      const image = await database.asset.findFirst({
        where: { id, playlistId, purpose: 'cover', state: 'ready' },
      })
      if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType))
        throw new DomainError(404, 'image_not_found')
      const opened = await openStoredFile(storageDir, {
        storageKey: image.storageKey,
        byteSize: image.byteSize,
        maxBytes: imageByteLimit,
      })
      if (!opened) throw new DomainError(404, 'image_not_found')
      return { ...opened, mimeType: image.mimeType }
    },
    /** Libère les réservations anciennes non référencées, puis réutilise la suppression durable Media. */
    async cleanup() {
      const images = await database.asset.findMany({
        where: { purpose: 'cover', state: 'ready', expiresAt: { lte: new Date() } },
        take: 100,
        orderBy: { expiresAt: 'asc' },
      })
      for (const image of images) {
        if (await referenced(image.id)) {
          await database.asset.update({
            where: { id: image.id },
            data: { expiresAt: new Date(Date.now() + 86400000) },
          })
          continue
        }
        // Une nouvelle réservation repousse expiresAt ; la condition empêche de la libérer.
        const released = await database.asset.updateMany({
          where: { id: image.id, expiresAt: image.expiresAt, playlistId: image.playlistId },
          data: { playlistId: null },
        })
        if (released.count && image.uploaderUserId)
          await deletions.remove(image.uploaderUserId, image.id)
      }
    },
  }
}
/** Opérations injectées lors de l’assemblage du serveur. */
export type PlaylistImagesService = ReturnType<typeof createPlaylistImagesService>
