/**
 * @file staging.ts
 * @brief Dossier temporaire d'un envoi, et mise en place définitive de ses fichiers.
 *
 * @details Un fichier en cours de réception ne doit jamais être visible comme un fichier terminé.
 *   Il est donc d'abord écrit dans un dossier temporaire nommé `.upload-<identifiant>/`. Une fois
 *   vérifié, il est « publié » sous son nom définitif.
 *
 * La publication utilise un « lien physique » : un second nom donné au même contenu, sans recopie.
 * Deux avantages : le fichier apparaît d'un seul coup, complet ; et l'opération échoue si un
 * fichier porte déjà ce nom, donc rien n'est jamais écrasé.
 */

import { lstat, open, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * @brief Expression régulière du nom d'un dossier temporaire d'envoi. Au démarrage, seuls les
 *   dossiers qui y correspondent sont examinés.
 */
export const stagingPattern =
  /^\.upload-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/

/** @brief Donne le chemin du dossier temporaire d'un envoi. */
export const stagingDirOf = (storageDir: string, id: string) => join(storageDir, `.upload-${id}`)
/** @brief Donne le nom définitif du fichier original d'un envoi. */
export const originalKeyOf = (id: string) => `${id}.original`
/** @brief Donne le nom définitif de l'aperçu MP3 d'un envoi. */
export const previewKeyOf = (id: string) => `${id}.preview.mp3`

/**
 * @brief Donne la liste des fichiers d'un dossier temporaire, avec pour chacun le nom définitif
 *   sous lequel il sera publié.
 */
export const stagedFiles = (id: string) => [
  { staged: 'original', published: originalKeyOf(id) },
  { staged: 'preview.mp3', published: previewKeyOf(id) },
]

/**
 * @brief Demande au système d'écrire réellement un dossier sur le disque.
 * @details Par défaut, le système garde un moment en mémoire les créations et suppressions de
 *   fichiers avant de les écrire. Si le courant est coupé entre-temps, elles sont perdues. Cette
 *   fonction force l'écriture immédiate.
 * @param path Chemin du dossier.
 */
export async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

/**
 * @brief Retire un fichier publié, à condition que ce soit bien celui que cet envoi a créé.
 * @details La vérification évite de supprimer un fichier de même nom appartenant à un autre envoi.
 * @param stagedPath Fichier dans le dossier temporaire.
 * @param publishedPath Fichier publié portant le nom définitif.
 */
async function unlinkOwnLink(stagedPath: string, publishedPath: string): Promise<void> {
  try {
    const staged = await lstat(stagedPath)
    const published = await lstat(publishedPath)
    const isSameFile = staged.ino === published.ino && staged.dev === published.dev
    if (staged.isFile() && published.isFile() && isSameFile) {
      await unlink(publishedPath)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

/**
 * @brief Annule un envoi : retire ses fichiers et supprime son dossier temporaire.
 * @param storageDir Dossier de stockage.
 * @param id Identifiant de l'envoi.
 * @param wasStored Vrai si la base a finalement enregistré le fichier ; dans ce cas ses fichiers
 *   publiés sont conservés et seul le dossier temporaire est supprimé.
 */
export async function discardStaging(storageDir: string, id: string, wasStored: boolean) {
  const staging = stagingDirOf(storageDir, id)
  if (!wasStored) {
    for (const { staged, published } of stagedFiles(id)) {
      await unlinkOwnLink(join(staging, staged), join(storageDir, published))
    }
  }
  await rm(staging, { recursive: true })
  await syncDirectory(storageDir)
}
