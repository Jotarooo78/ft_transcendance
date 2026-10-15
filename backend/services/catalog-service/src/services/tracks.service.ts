/**
 * @file tracks.service.ts
 * @brief Règles métier de la consultation des morceaux.
 *
 * @details Un service est la couche qui décide : il reçoit une demande déjà vérifiée dans sa forme,
 *   applique les règles du métier, et dit quoi répondre. Il ne connaît ni HTTP (c'est le rôle du
 *   contrôleur) ni SQL (c'est le rôle du repository). Ici les règles sont simples : seuls les
 *   morceaux publiés sont visibles, et un morceau introuvable est une erreur.
 */

import type { ArtistProfile } from '../domain/artist.js'
import type { UsersClient } from '../clients/users.client.js'
import type { PublicationsRepository } from '../repositories/publications.repository.js'
import { toTotal, type TrackListQuery, type TrackPage } from '../domain/track-list.js'
import { toTrack, trackNotFound, type Track } from '../domain/track.js'
import type { TracksRepository } from '../repositories/tracks.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createTracksService`, c'est-à-dire la liste de ses
 *   opérations.
 * @details Le contrôleur l'utilise pour déclarer de quoi il a besoin, sans dépendre de la façon
 *   dont le service est fabriqué.
 */
export type TracksService = ReturnType<typeof createTracksService>

/**
 * @brief Crée le service des morceaux.
 * @details Le service ne crée pas lui-même son accès à la base : il le reçoit. C'est ce qui permet
 *   de lui donner un faux repository dans les tests.
 * @param tracks Repository qui lit les morceaux.
 * @returns Un objet offrant les opérations `get` et `list`.
 */
export function createTracksService(
  tracks: TracksRepository,
  users: UsersClient,
  publications: PublicationsRepository
) {
  return {
    /**
     * @brief Renvoie un morceau publié à partir de son identifiant.
     * @details L'identifiant est d'abord mis en minuscules, car la base les stocke ainsi et un
     *   client peut l'avoir écrit en majuscules.
     * @param id Identifiant du morceau.
     * @returns Le morceau, sous sa forme publique.
     * @throws {DomainError} `404 track_not_found` si le morceau n'existe pas ou est encore en
     *   brouillon.
     */
    async get(id: string): Promise<Track> {
      const row = await tracks.findPublished(id.toLowerCase())
      if (!row) {
        throw trackNotFound()
      }
      if (!row.artistUserId) return toTrack(row)
      const profile = await users.read(row.artistUserId)
      return {
        ...toTrack({ ...row, artistName: profile.displayName }),
        artistAvatarUrl: profile.avatarUrl,
      }
    },

    /**
     * @brief Renvoie une page de morceaux publiés.
     * @details Demande les données brutes au repository, puis convertit chaque morceau et le total
     *   sous leur forme publique.
     * @param query Critères de recherche, de tri et de pagination.
     * @returns La page de morceaux, le total et les genres disponibles.
     */
    async list(query: TrackListQuery): Promise<TrackPage> {
      const owners = await publications.owners()
      const profiles: ArtistProfile[] = []
      for (let i = 0; i < owners.length; i += 8)
        profiles.push(...(await Promise.all(owners.slice(i, i + 8).map((id) => users.read(id)))))
      const { rows, total, genres } = await tracks.list(query, profiles)
      return {
        items: rows.map((row) => ({
          ...toTrack(row),
          ...(row.artistUserId
            ? {
                artistAvatarUrl:
                  profiles.find((p) => p.userId === row.artistUserId)?.avatarUrl ?? null,
              }
            : {}),
        })),
        total: toTotal(total),
        page: query.page,
        pageSize: query.pageSize,
        genres,
      }
    },
  }
}
