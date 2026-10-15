/** Vérifie les vrais fichiers de pochettes, la compensation SQL, la reprise et le nettoyage des représentations retirées. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, readdir, rm, mkdir, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  saveAudioCover,
  recoverCoverUploads,
  cleanRetiredCovers,
} from '../src/services/save-audio-cover.js'
import type { CoverStore } from '../src/domain/cover.js'
import type { CoverVariant as FileVariant } from '../src/domain/file.js'
import type { ValidatedFile } from '../src/domain/file.js'

/** Métadonnées déjà validées du petit fichier image de ces tests de stockage. */
const image: ValidatedFile = {
  purpose: 'image',
  mimeType: 'image/png',
  byteSize: 5,
  durationMs: null,
  checksumSha256: '0'.repeat(64),
}
/** Doublure SQL dont les confirmations peuvent être interrompues ; le disque du scénario est réel. */
function database() {
  const keys = new Set<string>(),
    retired: FileVariant[] = []
  const store: CoverStore = {
    /** Enregistre uniquement la clé créée par le scénario. */
    replace: async (_id, _owner, _image, storageKey) => {
      keys.add(storageKey)
      return {
        id: 'cover-id',
        renditionKey: 'cover',
        storageKey,
        mimeType: 'image/png',
        byteSize: 5n,
      }
    },
    /** Aucune association indépendante à retirer dans cette doublure de stockage. */
    remove: async () => {},
    /** Simule la preuve durable d’une confirmation SQL. */
    hasStorageKey: async (key) => keys.has(key),
    /** Retourne les traces retirées injectées dans le test. */
    retired: async (maximum) => retired.slice(0, maximum),
    /** Confirme le nettoyage des métadonnées de la clé retirée. */
    forgetRetired: async (key) => {
      keys.delete(key)
      const index = retired.findIndex((item) => item.storageKey === key)
      if (index >= 0) retired.splice(index, 1)
    },
  }
  return { store, keys, retired }
}

test('cover storage compensates certain failures and recovers uncertain commits without deleting confirmed bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cover-save-')),
    data = database()
  /** Prépare les octets déjà validés sous la cible temporaire de cette opération. */
  const prepare = async (path: string) => {
    await writeFile(path, 'image')
    return image
  }
  try {
    const failed = {
      ...data.store,
      replace: async () => {
        throw new Error('SQL offline')
      },
    }
    await assert.rejects(saveAudioCover(directory, 'audio', 'owner', failed, prepare))
    assert.deepEqual(await readdir(directory), [])
    const unknown = {
      ...failed,
      hasStorageKey: async () => {
        throw new Error('SQL unavailable')
      },
    }
    await assert.rejects(saveAudioCover(directory, 'audio', 'owner', unknown, prepare))
    assert.equal((await readdir(directory)).length, 2)
    assert.equal(await recoverCoverUploads(directory, data.store), 1)
    assert.deepEqual(await readdir(directory), [])
    const committed: CoverStore = {
      ...data.store,
      replace: async (...args) => {
        await data.store.replace(...args)
        throw new Error('Lost acknowledgement')
      },
    }
    await assert.rejects(saveAudioCover(directory, 'audio', 'owner', committed, prepare))
    const [key] = [...data.keys]
    assert.deepEqual(await readdir(directory), [key])
    assert.equal(await readFile(join(directory, key!), 'utf8'), 'image')
    assert.equal(
      await saveAudioCover(directory, 'audio', 'owner', data.store, async () => null),
      null
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('startup cover recovery keeps collisions and active files; retired cleanup remains retryable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cover-clean-')),
    data = database()
  try {
    const id = '11111111-1111-4111-8111-111111111111',
      key = `${id}.cover`,
      staging = join(directory, `.cover-${id}`)
    await mkdir(staging)
    await writeFile(join(staging, 'image'), 'ours')
    await writeFile(join(directory, key), 'foreign')
    await assert.rejects(recoverCoverUploads(directory, data.store, 0))
    await recoverCoverUploads(directory, data.store)
    assert.equal(await readFile(join(directory, key), 'utf8'), 'foreign')
    await writeFile(join(directory, 'active'), 'active')
    data.retired.push({
      id: 'retired-id',
      renditionKey: 'retired-cover',
      storageKey: key,
      mimeType: 'image/png',
      byteSize: 7n,
    })
    await assert.rejects(
      cleanRetiredCovers(directory, {
        ...data.store,
        forgetRetired: async () => {
          throw new Error('SQL offline')
        },
      })
    )
    await assert.rejects(readFile(join(directory, key)))
    assert.equal(data.retired.length, 1)
    assert.equal(await cleanRetiredCovers(directory, data.store), 1)
    assert.equal(data.retired.length, 0)
    assert.equal(await readFile(join(directory, 'active'), 'utf8'), 'active')
    await mkdir(staging)
    await writeFile(join(staging, 'image'), 'ours')
    await link(join(staging, 'image'), join(directory, key))
    await recoverCoverUploads(directory, data.store)
    await assert.rejects(readFile(join(directory, key)))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
