/**
 * @file playlist-mutations.ts
 * @brief Les quatre modifications possibles d'une playlist : ajouter un morceau, en retirer un,
 *   changer le nom ou la description, supprimer la playlist.
 *
 * @details Chacune s'exécute sous la protection décrite dans playlist-lock.ts : le propriétaire et
 *   la version sont vérifiés avant toute écriture. Chacune, sauf la suppression, augmente le numéro
 *   de version de 1 et renvoie la playlist à jour.
 */

import { itemNotFound, playlistLimit } from '../domain/errors.js'
import type { PlaylistChanges, PlaylistRow } from '../domain/playlist.js'
import { withLockedPlaylist, type PlaylistKey, type Tx } from './playlist-lock.js'
import type { Database } from './prisma.js'

/**
 * @brief Plus grande position qu'un morceau peut avoir dans une playlist : la plus grande valeur
 *   que la colonne de la base peut stocker.
 */
const maxPosition = 2147483647

/**
 * @brief Augmente de 1 la version de la playlist et renvoie la playlist à jour.
 * @param tx Transaction en cours.
 * @param id Identifiant de la playlist.
 * @param changes Nom ou description à modifier en même temps, s'il y en a.
 * @returns La playlist telle qu'elle est maintenant en base, avec ses morceaux dans l'ordre.
 */
function bumpVersion(tx: Tx, id: string, changes: PlaylistChanges = {}): Promise<PlaylistRow> {
  return tx.playlist.update({
    where: { id },
    data: { ...changes, version: { increment: 1 } },
    include: { items: { orderBy: { position: 'asc' } } },
  })
}

/**
 * @brief Crée les quatre fonctions de modification.
 * @param prisma Connexion à la base.
 * @returns Un objet contenant `addItem`, `removeItem`, `update` et `remove`.
 */
export function createPlaylistMutations(prisma: Database) {
  return {
    /**
     * @brief Ajoute un morceau à la fin de la playlist.
     * @details La nouvelle position est la plus grande position existante plus 1. Le même morceau
     *   peut être ajouté plusieurs fois : chaque ajout crée une occurrence distincte. L'existence
     *   du morceau dans le catalogue a été vérifiée avant, par le service.
     * @param key Compte, playlist et version attendue.
     * @param trackId Identifiant du morceau à ajouter.
     * @returns La playlist à jour.
     * @throws {DomainError} Les refus de `withLockedPlaylist`, ou `409 playlist_limit` si la
     *   position maximale est atteinte.
     */
    addItem(key: PlaylistKey, trackId: string): Promise<PlaylistRow> {
      return withLockedPlaylist(prisma, key, async (tx) => {
        const last = await tx.playlistItem.aggregate({
          where: { playlistId: key.id },
          _max: { position: true },
        })
        const position = (last._max.position ?? 0) + 1
        if (position > maxPosition) {
          throw playlistLimit()
        }
        await tx.playlistItem.create({
          data: { playlistId: key.id, trackId, position, addedByUserId: key.owner },
        })
        return bumpVersion(tx, key.id)
      })
    },

    /**
     * @brief Retire une occurrence précise de la playlist.
     * @details Les positions des morceaux restants ne sont pas recalculées : il peut rester un «
     *   trou » dans la numérotation, sans conséquence puisque seul l'ordre compte.
     * @param key Compte, playlist et version attendue.
     * @param itemId Identifiant de l'occurrence à retirer.
     * @returns La playlist à jour.
     * @throws {DomainError} Les refus de `withLockedPlaylist`, ou `404 item_not_found` si cette
     *   occurrence n'est pas dans la playlist.
     */
    removeItem(key: PlaylistKey, itemId: string): Promise<PlaylistRow> {
      return withLockedPlaylist(prisma, key, async (tx) => {
        const removed = await tx.playlistItem.deleteMany({
          where: { id: itemId, playlistId: key.id },
        })
        if (removed.count !== 1) {
          throw itemNotFound()
        }
        return bumpVersion(tx, key.id)
      })
    },

    /**
     * @brief Change le nom et/ou la description de la playlist.
     * @param key Compte, playlist et version attendue.
     * @param changes Champs à modifier, déjà nettoyés et vérifiés.
     * @returns La playlist à jour.
     */
    update(key: PlaylistKey, changes: PlaylistChanges): Promise<PlaylistRow> {
      return withLockedPlaylist(prisma, key, (tx) => bumpVersion(tx, key.id, changes))
    },

    /**
     * @brief Supprime la playlist.
     * @details Ses occurrences sont supprimées automatiquement par la base (suppression en
     *   cascade). Les morceaux eux-mêmes, qui appartiennent au catalogue, ne sont pas touchés.
     * @param key Compte, playlist et version attendue.
     */
    async remove(key: PlaylistKey): Promise<void> {
      await withLockedPlaylist(prisma, key, (tx) => tx.playlist.delete({ where: { id: key.id } }))
    },
  }
}
