/** Validation des droits et des références avant les commandes atomiques de playlist. */
import { playlistNotFound, trackNotFound, versionConflict } from '../domain/errors.js'
import { toPlaylist } from '../domain/playlist.js'
import type { CatalogClient } from '../clients/catalog.client.js'
import type { PlaylistsRepository } from '../repositories/playlists.repository.js'
import type { PlaylistActionsRepository } from '../repositories/playlist-actions.repository.js'
import type { PlaylistAction } from '../schemas/playlist-actions.schema.js'
/** Partage les lecteurs existants ; les mutations ne rejouent pas un ajout après une réponse perdue. */
export function createPlaylistActionsService(
  playlists: PlaylistsRepository,
  actions: PlaylistActionsRepository,
  catalog: CatalogClient
) {
  return {
    /** Valide tout le lot avant écriture, avec au plus huit appels Catalogue simultanés. */
    async change(owner: string, id: string, action: PlaylistAction) {
      id = id.toLowerCase()
      action = { ...action, operationId: action.operationId.toLowerCase() }
      if (action.kind === 'add')
        action.trackIds = action.trackIds.map((value) => value.toLowerCase())
      else if (action.kind === 'reorder')
        action.itemIds = action.itemIds.map((value) => value.toLowerCase())
      else if (action.kind === 'remove') action.itemId = action.itemId.toLowerCase()
      else action.removalId = action.removalId.toLowerCase()
      const replay = await actions.replay(owner, id, action)
      if (replay) return toPlaylist(replay)
      const current = await playlists.find(owner, id)
      if (!current) throw playlistNotFound()
      if (current.version !== BigInt(action.expectedVersion)) throw versionConflict()
      if (action.kind === 'add') {
        const pending = [...new Set(action.trackIds)]
        let cursor = 0
        await Promise.all(
          Array.from({ length: Math.min(8, pending.length) }, async () => {
            while (cursor < pending.length) {
              const trackId = pending[cursor++]!
              if (!(await catalog.isTrackPublished(trackId))) throw trackNotFound()
            }
          })
        )
      }
      return toPlaylist(await actions.change(owner, id, action))
    },
    /** Duplique uniquement la source encore accessible au moment de la transaction. */
    async duplicate(owner: string, source: string, target: string, version: number) {
      return toPlaylist(
        await actions.duplicate(owner, source.toLowerCase(), target.toLowerCase(), version)
      )
    },
  }
}
