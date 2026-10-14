/**
 * @file playlists.service.ts
 * @brief Règles métier des playlists : lister, lire, créer, modifier, supprimer.
 *
 * @details Un service est la couche qui décide. Il reçoit une demande dont la forme a déjà été
 *   vérifiée, applique les règles du métier et dit quoi répondre. Il ne connaît ni HTTP (rôle du
 *   contrôleur) ni SQL (rôle du repository).
 *
 * Règle de sécurité valable pour tout ce fichier : l'identifiant du compte (`owner`) vient toujours
 * du jeton de connexion vérifié, jamais d'une donnée envoyée par le client.
 */

import type { Pagination } from '@ft/service-kit'
import { playlistNotFound } from '../domain/errors.js'
import {
  toPlaylist,
  type Playlist,
  type PlaylistChanges,
  type PlaylistInput,
} from '../domain/playlist.js'
import type { PlaylistKey } from '../repositories/playlist-lock.js'
import type { PlaylistsRepository } from '../repositories/playlists.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createPlaylistsService`, c'est-à-dire la liste de ses
 *   opérations. Le contrôleur s'en sert pour déclarer ce dont il a besoin.
 */
export type PlaylistsService = ReturnType<typeof createPlaylistsService>
/**
 * @brief Une page de playlists telle que le client la reçoit : les playlists, leur nombre total, le
 *   numéro de page et la taille de page.
 */
export type PlaylistPage = Pagination & { items: Playlist[]; total: number }

/**
 * @brief Crée le service des playlists.
 * @details Il reçoit son accès à la base au lieu de le créer : c'est ce qui permet de lui donner un
 *   faux repository dans les tests.
 * @param playlists Repository qui lit et écrit les playlists.
 * @returns Un objet offrant `list`, `get`, `create`, `update` et `remove`.
 */
export function createPlaylistsService(playlists: PlaylistsRepository) {
  return {
    /**
     * @brief Renvoie une page des playlists du compte.
     * @param owner Identifiant du compte connecté.
     * @param pagination Numéro de page et nombre de playlists par page.
     * @returns La page de playlists, sous leur forme publique.
     */
    async list(owner: string, pagination: Pagination): Promise<PlaylistPage> {
      const { rows, total } = await playlists.list(owner, pagination)
      return { ...pagination, total, items: rows.map(toPlaylist) }
    },

    /**
     * @brief Renvoie une playlist du compte.
     * @param owner Identifiant du compte connecté.
     * @param id Identifiant de la playlist.
     * @returns La playlist, sous sa forme publique.
     * @throws {DomainError} `404 playlist_not_found` si elle n'existe pas ou appartient à un autre
     *   compte.
     */
    async get(owner: string, id: string): Promise<Playlist> {
      const row = await playlists.find(owner, id)
      if (!row) {
        throw playlistNotFound()
      }
      return toPlaylist(row)
    },

    /**
     * @brief Crée une playlist vide pour le compte.
     * @param owner Identifiant du compte connecté.
     * @param input Nom et description déjà vérifiés.
     * @returns La playlist créée.
     */
    async create(owner: string, input: PlaylistInput): Promise<Playlist> {
      return toPlaylist(await playlists.create(owner, input))
    },

    /**
     * @brief Change le nom et/ou la description d'une playlist.
     * @param key Compte, playlist et version que le client dit avoir lue.
     * @param changes Champs à modifier, déjà vérifiés.
     * @returns La playlist à jour, avec sa nouvelle version.
     * @throws {DomainError} `404 playlist_not_found` ou `409 version_conflict`.
     */
    async update(key: PlaylistKey, changes: PlaylistChanges): Promise<Playlist> {
      return toPlaylist(await playlists.update(key, changes))
    },

    /**
     * @brief Supprime une playlist.
     * @param key Compte, playlist et version que le client dit avoir lue.
     * @throws {DomainError} `404 playlist_not_found` ou `409 version_conflict`.
     */
    remove(key: PlaylistKey): Promise<void> {
      return playlists.remove(key)
    },
  }
}
