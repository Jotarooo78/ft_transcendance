/**
 * @file tracks.service.ts
 * @brief Règles métier de la consultation des morceaux.
 *
 * @details Un service est la couche qui décide : il reçoit une demande déjà vérifiée dans sa forme,
 *   applique les règles du métier, et dit quoi répondre. Il ne connaît ni HTTP (c'est le rôle du
 *   contrôleur) ni SQL (c'est le rôle du repository). Ici les règles sont simples : seuls les
 *   morceaux publiés sont visibles, et un morceau introuvable est une erreur.
 */

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
export function createTracksService(tracks: TracksRepository) {
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
      return toTrack(row)
    },

    /**
     * @brief Renvoie une page de morceaux publiés.
     * @details Demande les données brutes au repository, puis convertit chaque morceau et le total
     *   sous leur forme publique.
     * @param query Critères de recherche, de tri et de pagination.
     * @returns La page de morceaux, le total et les genres disponibles.
     */
    async list(query: TrackListQuery): Promise<TrackPage> {
      const { rows, total, genres } = await tracks.list(query)
      return {
        items: rows.map(toTrack),
        total: toTotal(total),
        page: query.page,
        pageSize: query.pageSize,
        genres,
      }
    },
  }
}
