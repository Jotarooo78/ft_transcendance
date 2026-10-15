/** Installe les pochettes sans écrasement et réconcilie SQL/disque après interruption ou résultat incertain. */
import { randomUUID } from 'node:crypto'
import { link, mkdir, open, lstat, unlink, rm, readdir, opendir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CoverStore } from '../domain/cover.js'
import { DomainError as FileError } from '@ft/service-kit'
import type { ValidatedFile } from '../domain/file.js'

/** Seuls les marqueurs de cette opération peuvent être repris, jamais un chemin fourni par le client. */
const marker = /^\.cover-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/
/** Rend durables les changements de noms avant de confirmer les métadonnées. */
async function syncDirectory(path: string) {
  const directory = await open(path, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

/** Nettoie un marqueur en conservant une clé SQL confirmée, et n’efface que les liens possédant le même inode. */
async function reconcile(storageDir: string, staging: string, id: string, store: CoverStore) {
  const key = `${id}.cover`
  if (!(await store.hasStorageKey(key))) {
    try {
      const source = await lstat(join(staging, 'image')),
        target = await lstat(join(storageDir, key))
      if (
        source.isFile() &&
        target.isFile() &&
        source.ino === target.ino &&
        source.dev === target.dev
      )
        await unlink(join(storageDir, key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  await rm(staging, { recursive: true })
  await syncDirectory(storageDir)
}

/**
 * Valide la pochette préparée sous un temporaire puis installe un lien unique et son association SQL.
 * Un résultat SQL incertain laisse un marqueur reprenable ; null signifie absence de pochette intégrée.
 */
export async function saveAudioCover(
  storageDir: string,
  audioId: string,
  owner: string,
  store: CoverStore,
  prepare: (path: string) => Promise<ValidatedFile | null>
) {
  const id = randomUUID(),
    staging = join(storageDir, `.cover-${id}`),
    key = `${id}.cover`
  await mkdir(staging, { mode: 0o700 })
  let installed = false
  try {
    const image = await prepare(join(staging, 'image'))
    if (!image) {
      await rm(staging, { recursive: true })
      return null
    }
    if (image.purpose !== 'image') throw new FileError(415, 'image_required')
    const file = await open(join(staging, 'image'), 'r')
    try {
      await file.sync()
    } finally {
      await file.close()
    }
    await syncDirectory(staging)
    await link(join(staging, 'image'), join(storageDir, key))
    installed = true
    await syncDirectory(storageDir)
    const cover = await store.replace(audioId, owner, image, key)
    await rm(staging, { recursive: true }).catch(() => {})
    return cover
  } catch (error) {
    if (installed)
      await reconcile(storageDir, staging, id, store).catch(() => {
        /* L’issue inconnue conserve son marqueur pour le redémarrage. */
      })
    else await rm(staging, { recursive: true }).catch(() => {})
    throw error
  }
}

/** Reprend avant ouverture du serveur les seuls marqueurs de pochettes, avec un nombre de dossiers borné. */
export async function recoverCoverUploads(storageDir: string, store: CoverStore, maximum = 1000) {
  const directory = await opendir(storageDir)
  let recovered = 0
  for await (const entry of directory) {
    const match = marker.exec(entry.name)
    if (!match || !entry.isDirectory()) continue
    if (recovered >= maximum) throw new FileError(503, 'cover_recovery_limit')
    const staging = join(storageDir, entry.name)
    if ((await readdir(staging)).some((name) => name !== 'image'))
      throw new FileError(503, 'cover_recovery_invalid')
    await reconcile(storageDir, staging, match[1]!, store)
    recovered++
  }
  return recovered
}

/** Supprime les seules variantes retirées, puis leur ligne SQL ; une erreur laisse la reprise possible. */
export async function cleanRetiredCovers(storageDir: string, store: CoverStore, maximum = 1000) {
  const retired = await store.retired(maximum + 1)
  if (retired.length > maximum) throw new FileError(503, 'cover_cleanup_limit')
  for (const cover of retired) {
    if (!/^[a-f0-9-]{36}\.cover$/.test(cover.storageKey))
      throw new FileError(503, 'cover_storage_invalid')
    try {
      const path = join(storageDir, cover.storageKey),
        stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new FileError(503, 'cover_storage_invalid')
      await unlink(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await syncDirectory(storageDir)
    await store.forgetRetired(cover.storageKey)
  }
  return retired.length
}
