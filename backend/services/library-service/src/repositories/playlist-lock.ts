/**
 * @file playlist-lock.ts
 * @brief Protection contre deux modifications simultanées de la même playlist.
 *
 * @details Le problème : un utilisateur a la même playlist ouverte dans deux onglets et clique «
 *   ajouter » dans les deux au même instant. Sans précaution, les deux requêtes liraient la même
 *   playlist, calculeraient la même nouvelle position, et l'une écraserait l'autre.
 *
 * La solution combine deux mécanismes. Un verrou : la requête `SELECT ... FOR UPDATE` réserve la
 * ligne de la playlist jusqu'à la fin de la transaction ; la seconde requête attend que la première
 * ait fini. Un contrôle de version : une fois son tour venu, la seconde requête constate que le
 * numéro de version n'est plus celui que le client avait lu, et elle est refusée avec `409
 * version_conflict`.
 *
 * Toutes les écritures sur une playlist passent par la fonction de ce fichier.
 */

import { playlistLimit, playlistNotFound, versionConflict } from '../domain/errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { Database } from './prisma.js'

/**
 * @brief Connexion à la base à l'intérieur d'une transaction, c'est-à-dire d'un groupe d'écritures
 *   qui réussissent toutes ou échouent toutes.
 */
export type Tx = Prisma.TransactionClient

/**
 * @brief Les trois informations nécessaires pour modifier une playlist.
 * @details `owner` : le compte qui fait la demande, lu dans son jeton de connexion. `id` : la
 *   playlist visée. `expectedVersion` : la version que le client dit avoir lue.
 */
export type PlaylistKey = { owner: string; id: string; expectedVersion: number }

/**
 * @brief Exécute une modification en ayant réservé la playlist.
 * @details Étapes : ouvrir une transaction ; réserver la ligne de la playlist, à condition qu'elle
 *   appartienne bien à ce compte ; vérifier la version ; exécuter la modification ; valider la
 *   transaction, ce qui libère la réserve. Si une étape échoue, rien n'est enregistré.
 * @param prisma Connexion à la base.
 * @param key Compte, playlist et version attendue.
 * @param change Modification à effectuer. Elle reçoit la connexion de la transaction et doit
 *   utiliser celle-ci pour toutes ses écritures : une écriture faite avec la connexion générale ne
 *   serait pas protégée par la réserve.
 * @returns Ce que `change` renvoie.
 * @throws {DomainError} `404 playlist_not_found` si la playlist n'existe pas ou appartient à un
 *   autre compte ; `409 version_conflict` si elle a changé depuis sa lecture ; `409 playlist_limit`
 *   si son numéro de version ne peut plus augmenter.
 */
export function withLockedPlaylist<T>(
  prisma: Database,
  { owner, id, expectedVersion }: PlaylistKey,
  change: (tx: Tx) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ version: bigint }[]>`
      SELECT version FROM library.playlists
      WHERE id = ${id}::uuid AND owner_user_id = ${owner}::uuid AND visibility = 'private'
      FOR UPDATE`
    const locked = rows[0]
    if (!locked) {
      throw playlistNotFound()
    }
    if (locked.version !== BigInt(expectedVersion)) {
      throw versionConflict()
    }
    if (locked.version >= BigInt(Number.MAX_SAFE_INTEGER)) {
      throw playlistLimit()
    }
    return change(tx)
  })
}
