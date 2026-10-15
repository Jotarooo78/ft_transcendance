/**
 * @file upload.service.ts
 * @brief Réception d'un fichier envoyé, de l'arrivée des octets jusqu'à son enregistrement
 *   définitif.
 *
 * @details La difficulté : un envoi écrit à deux endroits, le disque et la base de données, et le
 *   service peut s'arrêter à n'importe quel moment entre les deux. Il ne faut jamais se retrouver
 *   avec un fichier sur le disque que la base ignore, ni avec une ligne en base sans fichier.
 *
 * Les étapes sont donc toujours dans cet ordre : 1) écrire le fichier reçu dans un dossier
 * temporaire ; 2) le vérifier ; 3) le publier sous son nom définitif ; 4) l'enregistrer en base ;
 * 5) supprimer le dossier temporaire. Si une étape échoue, tout ce qui précède est défait.
 *
 * Si le service s'arrête brutalement en cours de route, le dossier temporaire reste sur le disque.
 * Au démarrage suivant, `recover` examine ces dossiers : si la base connaît le fichier, l'envoi est
 * considéré comme réussi ; sinon ses fichiers sont retirés.
 */

import { DomainError } from '@ft/service-kit'
import { randomUUID } from 'node:crypto'
import { link, mkdir, opendir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileError, storageUnavailable } from '../domain/errors.js'
import type { StoredFile } from '../domain/file.js'
import type { AssetsRepository } from '../repositories/assets.repository.js'
import {
  discardStaging,
  originalKeyOf,
  previewKeyOf,
  stagingDirOf,
  stagingPattern,
  syncDirectory,
} from '../storage/staging.js'
import type { FileValidator } from '../validation/validate-file.js'

/**
 * @brief Type de l'objet renvoyé par `createUploadService` : les opérations `save` et `recover`.
 */
export type UploadService = ReturnType<typeof createUploadService>

/**
 * @brief Fonction fournie par le contrôleur, qui écrit le fichier reçu à l'endroit indiqué et
 *   renvoie le type annoncé par le navigateur.
 */
export type Receive = (path: string) => Promise<string>

/** @brief Partie du repository dont ce service a besoin. */
type Store = Pick<AssetsRepository, 'create' | 'hasStorageKey'>
/**
 * @brief Ce dont le service a besoin : le dossier de stockage, le repository et la fonction de
 *   vérification.
 */
type Options = { storageDir: string; assets: Store; validate: FileValidator }

/** @brief Crée le refus `400 upload_aborted` : l'utilisateur a annulé son envoi. */
const uploadAborted = () => fileError(400, 'upload_aborted')
/** @brief Les seuls noms de fichiers qu'un dossier temporaire a le droit de contenir. */
const stagedNames = ['original', 'preview.mp3']

/**
 * @brief Transforme une erreur imprévue survenue pendant un envoi en refus compréhensible par le
 *   client.
 * @param error Erreur survenue.
 * @param signal Signal indiquant si l'envoi a été annulé.
 * @returns Le refus à renvoyer : le refus déjà connu, `invalid_multipart` pour une erreur de
 *   lecture du formulaire, `400 upload_aborted` si l'envoi a été annulé, sinon `503
 *   file_storage_unavailable`.
 */
function toUploadError(error: unknown, signal?: AbortSignal): DomainError {
  if (error instanceof DomainError) {
    return error
  }
  const code = (error as NodeJS.ErrnoException).code ?? ''
  if (code.startsWith('FST_')) {
    return fileError(code === 'FST_REQ_FILE_TOO_LARGE' ? 413 : 400, 'invalid_multipart')
  }
  return signal?.aborted ? uploadAborted() : storageUnavailable()
}

/**
 * @brief Crée le service d'envoi.
 * @param options Dossier de stockage, repository et fonction de vérification.
 * @returns Un objet offrant `save` (traiter un envoi) et `recover` (réparer au démarrage).
 */
export function createUploadService({ storageDir, assets, validate }: Options) {
  /**
   * @brief Défait un envoi qui a échoué.
   * @details Avant de retirer les fichiers, elle demande à la base si le fichier a finalement été
   *   enregistré : une erreur a pu survenir juste après l'enregistrement.
   * @param id Identifiant de l'envoi.
   */
  async function discard(id: string): Promise<void> {
    const wasStored = await assets.hasStorageKey(originalKeyOf(id))
    await discardStaging(storageDir, id, wasStored)
  }

  return {
    /**
     * @brief Reçoit un fichier, le vérifie, le range sur le disque et l'enregistre en base.
     * @param owner Identifiant du compte qui envoie le fichier.
     * @param receive Fonction qui écrit le fichier reçu sur le disque.
     * @param signal Signal qui se déclenche si l'utilisateur annule son envoi.
     * @returns Le fichier enregistré.
     * @throws {DomainError} Le refus prononcé par la vérification (type, taille, contenu...) ; `400
     *   upload_aborted` si l'envoi est annulé ; `503 file_storage_unavailable` si le disque ou la
     *   base échoue.
     */
    async save(
      owner: string,
      receive: Receive,
      signal?: AbortSignal,
      expiresAt?: Date
    ): Promise<StoredFile> {
      const id = randomUUID()
      const staging = stagingDirOf(storageDir, id)
      await mkdir(staging, { mode: 0o700 }).catch(() => {
        throw storageUnavailable()
      })
      let published = false
      try {
        const original = join(staging, 'original')
        const preview = join(staging, 'preview.mp3')
        const declaredMime = await receive(original)
        if (signal?.aborted) {
          throw uploadAborted()
        }
        const file = await validate(original, declaredMime, { signal, previewPath: preview })
        if (signal?.aborted) {
          throw uploadAborted()
        }

        if (file.purpose !== 'audio') throw fileError(415, 'audio_required')
        const previewKey = file.purpose === 'audio' ? previewKeyOf(id) : undefined
        await syncDirectory(staging)
        await link(original, join(storageDir, originalKeyOf(id)))
        published = true
        if (previewKey) {
          await link(preview, join(storageDir, previewKey))
        }
        await syncDirectory(storageDir)
        const asset = await assets.create(id, owner, file, originalKeyOf(id), previewKey, expiresAt)
        // L'enregistrement est confirmé : un échec du nettoyage ne remet pas le fichier en cause.
        await rm(staging, { recursive: true }).catch(() => undefined)
        return asset
      } catch (error) {
        // Si l'issue de l'écriture en base est incertaine, le dossier temporaire reste en place :
        // la reprise au démarrage tranchera.
        const cleanup = published ? discard(id) : rm(staging, { recursive: true })
        await cleanup.catch(() => undefined)
        throw toUploadError(error, signal)
      }
    },

    /**
     * @brief Répare, au démarrage, les envois qu'un arrêt brutal a interrompus.
     * @param maximum Nombre maximal de dossiers temporaires à traiter.
     * @returns Le nombre de dossiers traités.
     * @throws {DomainError} `503 upload_recovery_invalid` si un dossier contient un fichier
     *   inattendu ; `503 upload_recovery_limit` s'il y a plus de dossiers que le maximum. Dans les
     *   deux cas le service refuse de démarrer plutôt que de deviner.
     */
    async recover(maximum = 1000): Promise<number> {
      await mkdir(storageDir, { recursive: true })
      let recovered = 0
      for await (const entry of await opendir(storageDir)) {
        const match = stagingPattern.exec(entry.name)
        if (!entry.isDirectory() || !match) {
          continue
        }
        if (recovered >= maximum) {
          throw fileError(503, 'upload_recovery_limit')
        }
        const children = await readdir(join(storageDir, entry.name))
        if (children.some((name) => !stagedNames.includes(name))) {
          throw fileError(503, 'upload_recovery_invalid')
        }
        await discard(match[1]!)
        recovered++
      }
      return recovered
    },
  }
}
