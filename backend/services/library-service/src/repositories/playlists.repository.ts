/**
 * @file playlists.repository.ts
 * @brief Lecture et écriture des playlists dans la base de données.
 *
 * @details Un repository est la couche qui parle à la base. Il sait quelles tables lire et comment,
 *   mais ne décide de rien : c'est le service qui l'appelle et qui applique les règles.
 *
 * Les lectures personnelles filtrent sur le propriétaire. La lecture de partage
 * vérifie séparément la visibilité publique actuelle.
 */

import type { Pagination } from '@ft/service-kit'
import type { PlaylistInput, PlaylistRow } from '../domain/playlist.js'
import { createPlaylistMutations } from './playlist-mutations.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createPlaylistsRepository` : toutes les opérations
 *   disponibles sur les playlists.
 * @details Les services ne dépendent que de ce type. Un test peut fournir à la place un objet en
 *   mémoire qui offre les mêmes opérations.
 */
export type PlaylistsRepository = ReturnType<typeof createPlaylistsRepository>

/**
 * @brief Option de lecture : charger aussi les morceaux de la playlist, rangés par position
 *   croissante.
 */
const orderedItems = { items: { orderBy: { position: 'asc' } } } as const

/**
 * @brief Crée le repository des playlists branché sur PostgreSQL.
 * @param prisma Connexion à la base, créée dans server.ts.
 * @returns Un objet offrant les lectures (`list`, `find`), la création (`create`) et les quatre
 *   modifications de playlist-mutations.ts.
 */
export function createPlaylistsRepository(prisma: Database) {
  /**
   * @brief Fabrique la condition « playlists appartenant à ce compte », utilisée par les
   *   lectures personnelles.
   * @param owner Identifiant du compte.
   * @returns La condition à passer à Prisma.
   */
  const ownedBy = (owner: string) => ({ ownerUserId: owner })

  return {
    ...createPlaylistMutations(prisma),
    /** @brief Lit seulement une playlist actuellement publique, sans cache. */
    findPublic(id: string): Promise<PlaylistRow | null> {
      return prisma.playlist.findFirst({
        where: { id, visibility: 'public' },
        include: orderedItems,
      })
    },

    /**
     * @brief Lit une page des playlists d'un compte.
     * @details Les playlists modifiées le plus récemment viennent en premier. La page et le nombre
     *   total sont lus dans la même transaction, pour qu'ils décrivent le même état de la base.
     * @param owner Identifiant du compte.
     * @param pagination Numéro de page et nombre de playlists par page.
     * @returns Les playlists de la page et le nombre total de playlists du compte.
     */
    async list(owner: string, { page, pageSize }: Pagination) {
      const where = ownedBy(owner)
      const [rows, total] = await prisma.$transaction(
        [
          prisma.playlist.findMany({
            where,
            orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: orderedItems,
          }),
          prisma.playlist.count({ where }),
        ],
        { isolationLevel: 'RepeatableRead' }
      )
      return { rows: rows as PlaylistRow[], total }
    },

    /**
     * @brief Lit une playlist d'un compte.
     * @param owner Identifiant du compte.
     * @param id Identifiant de la playlist.
     * @returns La playlist avec ses morceaux, ou null si elle n'existe pas ou appartient à un autre
     *   compte.
     */
    find(owner: string, id: string): Promise<PlaylistRow | null> {
      return prisma.playlist.findFirst({
        where: { id, ...ownedBy(owner) },
        include: orderedItems,
      })
    },

    /**
     * @brief Crée une playlist vide.
     * @details Elle commence à la version 1, privée sauf choix explicite du propriétaire.
     * @param owner Identifiant du compte propriétaire.
     * @param input Nom et description déjà vérifiés.
     * @returns La playlist créée.
     */
    create(owner: string, input: PlaylistInput): Promise<PlaylistRow> {
      return prisma.playlist.create({
        data: {
          ...input,
          ownerUserId: owner,
          visibility: input.visibility ?? 'private',
          version: 1n,
        },
        include: { items: true },
      })
    },
  }
}
