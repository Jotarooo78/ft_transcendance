/**
 * @file playlist-items.service.ts
 * @brief Règles métier de l'ajout et du retrait d'un morceau dans une playlist.
 *
 * @details C'est le seul endroit du service qui fait appel à un autre service : pour ajouter un
 *   morceau, il faut vérifier auprès du catalogue que ce morceau existe. Le retrait, lui, ne
 *   demande rien au catalogue : on doit pouvoir retirer un morceau même si le catalogue est en
 *   panne.
 */

import type { CatalogClient } from '../clients/catalog.client.js'
import { playlistNotFound, trackNotFound, versionConflict } from '../domain/errors.js'
import { toPlaylist, type Playlist } from '../domain/playlist.js'
import type { PlaylistKey } from '../repositories/playlist-lock.js'
import type { PlaylistsRepository } from '../repositories/playlists.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createPlaylistItemsService` : les opérations `add` et
 *   `remove`.
 */
export type PlaylistItemsService = ReturnType<typeof createPlaylistItemsService>

/**
 * @brief Crée le service des morceaux d'une playlist.
 * @param playlists Repository des playlists.
 * @param catalog Client qui interroge le catalogue.
 * @returns Un objet offrant `add` et `remove`.
 */
export function createPlaylistItemsService(playlists: PlaylistsRepository, catalog: CatalogClient) {
  return {
    /**
     * @brief Ajoute un morceau à une playlist.
     * @details Les vérifications sont faites dans un ordre précis : 1) la playlist existe-t-elle
     *   pour ce compte ? 2) la version est-elle bien celle que le client a lue ? 3) le morceau
     *   est-il publié dans le catalogue ? Le catalogue n'est donc interrogé que si la demande est
     *   par ailleurs recevable, ce qui évite un appel réseau inutile. La version est revérifiée
     *   ensuite, au moment de l'écriture, sous verrou.
     * @param key Compte, playlist et version que le client dit avoir lue.
     * @param trackId Identifiant du morceau à ajouter.
     * @returns La playlist à jour.
     * @throws {DomainError} `404 playlist_not_found`, `409 version_conflict` ou `404
     *   track_not_found`, dans cet ordre de priorité.
     */
    async add(key: PlaylistKey, trackId: string): Promise<Playlist> {
      const current = await playlists.find(key.owner, key.id)
      if (!current) {
        throw playlistNotFound()
      }
      if (toPlaylist(current).version !== key.expectedVersion) {
        throw versionConflict()
      }
      if (!(await catalog.isTrackPublished(trackId))) {
        throw trackNotFound()
      }
      return toPlaylist(await playlists.addItem(key, trackId))
    },

    /**
     * @brief Retire une occurrence d'une playlist.
     * @param key Compte, playlist et version que le client dit avoir lue.
     * @param itemId Identifiant de l'occurrence à retirer (et non du morceau).
     * @returns La playlist à jour.
     * @throws {DomainError} `404 playlist_not_found`, `409 version_conflict` ou `404
     *   item_not_found`.
     */
    async remove(key: PlaylistKey, itemId: string): Promise<Playlist> {
      return toPlaylist(await playlists.removeItem(key, itemId))
    },
  }
}
