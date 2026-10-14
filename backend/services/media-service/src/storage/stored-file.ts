/**
 * @file stored-file.ts
 * @brief Ouverture sécurisée d'un fichier rangé sur le disque.
 *
 * @details Le dossier `storage/` regroupe ce qui touche directement aux fichiers du disque. Avant
 *   d'envoyer un fichier à un client, on vérifie ici que c'est bien un fichier ordinaire, situé
 *   dans le dossier de stockage, et de la taille enregistrée en base.
 */

import { constants } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { isSafeStorageKey } from '../domain/file.js'

/** @brief Un fichier ouvert, prêt à être lu, avec sa taille réelle. */
export type OpenedFile = { handle: FileHandle; size: number }

/**
 * @brief Ce que la base annonce du fichier à ouvrir : son nom, sa taille enregistrée et la taille
 *   maximale acceptable.
 */
type Expected = {
  /** @brief Nom du fichier sur le volume. */
  storageKey: string
  /** @brief Taille enregistrée en base ; le fichier doit faire exactement cette taille. */
  byteSize: bigint | null
  /** @brief Plus grande taille acceptable pour ce type de contenu. */
  maxBytes: number
}

/**
 * @brief Codes d'erreur du système signifiant « il n'y a pas de fichier ordinaire à cet endroit ».
 */
const missingCodes = ['ENOENT', 'ENOTDIR', 'ELOOP']

/**
 * @brief Dit si une erreur d'ouverture signifie simplement que le fichier n'est pas là.
 * @param error Erreur levée par le système.
 * @returns Vrai si le fichier est absent, si le chemin est invalide, ou si c'est un lien symbolique
 *   (un raccourci vers un autre fichier, qu'on refuse de suivre).
 */
export const isMissingFile = (error: unknown) =>
  missingCodes.includes((error as NodeJS.ErrnoException).code ?? '')

/**
 * @brief Ouvre un fichier du dossier de stockage après avoir vérifié son nom, sa nature et sa
 *   taille.
 * @details Les vérifications portent sur le fichier une fois ouvert, et non sur son chemin : il est
 *   donc impossible de remplacer le fichier par un autre entre le moment du contrôle et celui de la
 *   lecture.
 * @param storageDir Dossier de stockage.
 * @param expected Nom, taille enregistrée et taille maximale acceptable.
 * @returns Le fichier ouvert, ou null si une vérification échoue. Celui qui appelle cette fonction
 *   doit refermer le fichier quand il a fini.
 */
export async function openStoredFile(storageDir: string, expected: Expected) {
  const { storageKey, byteSize, maxBytes } = expected
  if (
    !isSafeStorageKey(storageKey) ||
    byteSize === null ||
    byteSize <= 0n ||
    byteSize > BigInt(maxBytes)
  ) {
    return null
  }
  let handle: FileHandle
  try {
    // NOFOLLOW refuse un lien symbolique ; NONBLOCK empêche un tube nommé de bloquer l'ouverture.
    const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    handle = await open(join(storageDir, storageKey), flags)
  } catch (error) {
    if (isMissingFile(error)) {
      return null
    }
    throw error
  }
  const stat = await handle.stat()
  if (!stat.isFile() || stat.size !== Number(byteSize)) {
    await handle.close()
    return null
  }
  return { handle, size: stat.size } satisfies OpenedFile
}
