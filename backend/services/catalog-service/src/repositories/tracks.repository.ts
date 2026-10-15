/**
 * @file tracks.repository.ts
 * @brief Lecture des morceaux dans la base de données.
 *
 * @details Un repository est la couche qui parle à la base : il sait quelles tables lire et
 *   comment, et renvoie des données brutes. Il ne décide de rien : il ne sait pas ce qu'est une
 *   réponse HTTP ni ce qu'il faut faire quand un morceau est introuvable. Ces décisions
 *   appartiennent au service (services/tracks.service.ts), qui est le seul à appeler ce fichier.
 *
 * Le fichier définit d'abord un type, `TracksRepository`, qui dit quelles opérations existent, puis
 * une fonction qui en fournit la version PostgreSQL. Cette séparation permet aux tests de fournir à
 * la place une version en mémoire qui respecte le même type.
 */

import type { ArtistProfile } from '../domain/artist.js'
import type { TrackListQuery } from '../domain/track-list.js'
import type { TrackRow } from '../domain/track.js'
import { Prisma } from '../generated/prisma/client.js'
import type { Database } from './prisma.js'
import { filteredTracks, publishedGenres, publishedTracks, sortColumn } from './track-list.sql.js'

/**
 * @brief Résultat d'une lecture de liste, tel que la base le renvoie.
 * @details `rows` : les morceaux de la page demandée ; `total` : le nombre de morceaux
 *   correspondant à la recherche, toutes pages confondues ; `genres` : les genres existants.
 */
export type TrackListResult = { rows: TrackRow[]; total: bigint; genres: string[] }

/**
 * @brief Liste des opérations de lecture disponibles sur les morceaux.
 * @details Le service ne dépend que de ce type. Il ignore si les données viennent de PostgreSQL ou
 *   d'un faux repository de test.
 */
export type TracksRepository = {
  /**
   * @brief Cherche un morceau publié par son identifiant ; renvoie null s'il n'existe pas ou s'il
   *   est encore en brouillon.
   */
  findPublished: (id: string) => Promise<TrackRow | null>
  /** @brief Lit une page de morceaux selon les critères, avec le total et les genres. */
  list: (query: TrackListQuery, profiles?: ArtistProfile[]) => Promise<TrackListResult>
}

/**
 * @brief Crée le repository des morceaux branché sur PostgreSQL.
 * @param prisma Connexion à la base, créée dans server.ts.
 * @returns Un objet offrant les opérations de `TracksRepository`.
 */
export function createTracksRepository(prisma: Database): TracksRepository {
  return {
    /**
     * @brief Lit un morceau publié dans la base.
     * @details Réutilise la requête `publishedTracks` en y ajoutant la condition sur l'identifiant
     *   : le morceau a ainsi exactement les mêmes champs calculés que dans la liste.
     * @param id Identifiant du morceau, en minuscules.
     * @returns Le morceau, ou null s'il est absent ou en brouillon.
     */
    async findPublished(id) {
      const rows = await prisma.$queryRaw<TrackRow[]>(
        Prisma.sql`${publishedTracks()} AND t.id = ${id}::uuid`
      )
      return rows[0] ?? null
    },

    /**
     * @brief Lit une page de morceaux, le nombre total de résultats et la liste des genres.
     * @details Les trois lectures sont faites dans une même transaction de niveau `RepeatableRead`
     *   : elles voient toutes le même état de la base. Sans cela, un morceau publié entre deux
     *   lectures pourrait donner un total qui ne correspond pas à la page affichée. Le tri se
     *   termine toujours par l'identifiant, pour que deux morceaux de même titre gardent un ordre
     *   stable d'une page à l'autre.
     * @param query Critères de recherche validés.
     * @returns Les morceaux de la page, le total et les genres.
     */
    list(query, profiles = []) {
      const filtered = filteredTracks(query, profiles)
      const offset = (query.page - 1) * query.pageSize
      // RepeatableRead : le total et la page ne peuvent pas décrire deux états différents.
      return prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<TrackRow[]>(Prisma.sql`${filtered}
            SELECT * FROM filtered
            ORDER BY ${sortColumn(query.sort)} ASC NULLS LAST, id ASC
            LIMIT ${query.pageSize} OFFSET ${offset}`)
          const counts = await tx.$queryRaw<{ total: bigint }[]>(
            Prisma.sql`${filtered} SELECT count(*) AS total FROM filtered`
          )
          const genres = await tx.$queryRaw<{ name: string }[]>(publishedGenres)
          return { rows, total: counts[0]?.total ?? 0n, genres: genres.map((genre) => genre.name) }
        },
        { isolationLevel: 'RepeatableRead' }
      )
    },
  }
}
