/**
 * @file file-deletion.service.ts
 * @brief Suppression d'un fichier personnel, conçue pour pouvoir être reprise après une panne.
 *
 * @details Supprimer un fichier demande deux actions : retirer son contenu du disque et mettre à
 *   jour la base. Pour ne jamais rester dans un état incohérent, la suppression passe par un état
 *   intermédiaire. Le fichier passe d'abord de `ready` à `deleting` ; son contenu est retiré du
 *   disque ; il passe enfin à `deleted`.
 *
 * Si le service s'arrête au milieu, le fichier reste dans l'état `deleting`. Au démarrage suivant,
 * `recover` retrouve ces fichiers et termine leur suppression.
 */

import { lstat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { CatalogClient } from '../clients/catalog.client.js'
import { fileError, fileInUse, fileNotFound, storageUnavailable } from '../domain/errors.js'
import { isManagedPurpose, isSafeStorageKey } from '../domain/file.js'
import type { AssetsRepository } from '../repositories/assets.repository.js'
import { syncDirectory } from '../storage/staging.js'

/**
 * @brief Type de l'objet renvoyé par `createFileDeletionService` : les opérations `remove` et
 *   `recover`.
 */
export type FileDeletionService = ReturnType<typeof createFileDeletionService>

/** @brief Partie du repository dont ce service a besoin. */
type Store = Pick<
  AssetsRepository,
  'findOwnedWithAllVariants' | 'markDeleting' | 'markDeleted' | 'pendingDeletions'
>
/**
 * @brief Ce dont le service a besoin : le dossier de stockage, le repository et le client du
 *   catalogue.
 */
type Options = {
  /** @brief Dossier du volume. */
  storageDir: string
  /** @brief Métadonnées des fichiers. */
  assets: Store
  /** @brief Question « ce fichier est-il encore utilisé ? ». */
  catalog: Pick<CatalogClient, 'isAssetReferenced'>
}

/**
 * @brief Supprime un fichier du dossier de stockage.
 * @details Un fichier déjà absent n'est pas une erreur : c'est ce qui permet de reprendre une
 *   suppression interrompue.
 * @param storageDir Dossier de stockage.
 * @param storageKey Nom du fichier.
 * @throws {DomainError} `503 file_storage_unavailable` si le nom est dangereux ou si ce n'est pas
 *   un fichier ordinaire.
 */
async function removeStoredFile(storageDir: string, storageKey: string): Promise<void> {
  if (!isSafeStorageKey(storageKey)) {
    throw storageUnavailable()
  }
  try {
    const path = join(storageDir, storageKey)
    const stat = await lstat(path)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw storageUnavailable()
    }
    await unlink(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

/**
 * @brief Crée le service de suppression.
 * @param options Dossier de stockage, repository et client du catalogue.
 * @returns Un objet offrant `remove` (supprimer un fichier) et `recover` (terminer au démarrage).
 */
export function createFileDeletionService({ storageDir, assets, catalog }: Options) {
  /**
   * @brief Supprime un fichier appartenant à l'utilisateur connecté.
   * @details Le catalogue est interrogé avant tout retrait : si le fichier sert encore à un
   *   morceau, la suppression est refusée. Si le catalogue ne répond pas, elle est refusée aussi,
   *   plutôt que de risquer de retirer un fichier utilisé. Supprimer un fichier déjà supprimé n'est
   *   pas une erreur.
   * @param owner Identifiant de l'utilisateur connecté.
   * @param id Identifiant du fichier.
   * @throws {DomainError} `404 file_not_found` si le fichier n'existe pas ou appartient à un autre
   *   compte ; `409 file_in_use` s'il est encore utilisé par le catalogue.
   */
  async function remove(owner: string, id: string): Promise<void> {
    const asset = await assets.findOwnedWithAllVariants(owner, id)
    if (!asset || asset.uploaderUserId !== owner || !isManagedPurpose(asset.purpose)) {
      throw fileNotFound()
    }
    if (asset.state === 'deleted') {
      return
    }
    if (asset.state !== 'ready' && asset.state !== 'deleting') {
      throw fileNotFound()
    }
    if (await catalog.isAssetReferenced(id)) {
      throw fileInUse()
    }
    if (asset.state === 'ready' && !(await assets.markDeleting(id, owner))) {
      // Une suppression concurrente a pris la main : on ne continue que si elle est en cours.
      const current = await assets.findOwnedWithAllVariants(owner, id)
      if (current?.state === 'deleted') {
        return
      }
      if (current?.state === 'ready') throw fileInUse()
      if (current?.state !== 'deleting') {
        throw fileNotFound()
      }
    }
    // Relit les variantes après le verrou de suppression : une pochette pouvait finir juste avant.
    const locked = await assets.findOwnedWithAllVariants(owner, id)
    if (!locked || locked.state === 'deleted') return
    for (const key of [
      locked.storageKey,
      ...locked.variants.map((variant) => variant.storageKey),
    ]) {
      await removeStoredFile(storageDir, key)
    }
    await syncDirectory(storageDir)
    await assets.markDeleted(id, owner)
  }

  return {
    remove,

    /**
     * @brief Termine, au démarrage, les suppressions restées dans l'état `deleting`.
     * @param maximum Nombre maximal de fichiers à traiter.
     * @returns Le nombre de suppressions en attente trouvées.
     * @throws {DomainError} `503 deletion_recovery_limit` s'il y en a plus que le maximum.
     */
    async recover(maximum = 1000): Promise<number> {
      const pending = await assets.pendingDeletions(maximum + 1)
      for (const asset of pending.slice(0, maximum)) {
        await remove(asset.uploaderUserId!, asset.id)
      }
      if (pending.length > maximum) {
        throw fileError(503, 'deletion_recovery_limit')
      }
      return pending.length
    },
  }
}
