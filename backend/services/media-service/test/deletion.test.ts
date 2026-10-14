/**
 * @file deletion.test.ts
 * @brief Tests de la suppression d'un fichier.
 *
 * @details Ils vérifient le refus quand le fichier est encore utilisé ou que le catalogue est en
 *   panne, le comportement quand deux suppressions arrivent en même temps, et la reprise d'une
 *   suppression interrompue.
 */

import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createFileDeletionService } from '../src/services/file-deletion.service.js'
import { buildTestApp, fakeAssets, fileId, other, owner } from './helpers.js'

/**
 * @brief Crée un faux repository et un faux catalogue pour un seul fichier, avec des interrupteurs
 *   pour simuler des pannes.
 * @returns Le fichier, les interrupteurs de panne, le faux repository et le faux client.
 */
function deletionState() {
  const asset = {
    id: fileId,
    uploaderUserId: owner as string | null,
    purpose: 'audio',
    state: 'ready',
    storageKey: 'original',
    mimeType: 'audio/wav',
    byteSize: 5n,
    durationMs: 1000n,
    checksumSha256: 'hash',
    variants: [{ storageKey: 'preview', mimeType: 'audio/mpeg', byteSize: 5n }],
  }
  const flags = { used: false, catalogFailure: false, databaseFailure: false }
  const assets = fakeAssets({
    findOwnedWithAllVariants: async (subject, id) =>
      id === fileId && subject === asset.uploaderUserId ? { ...asset } : null,
    markDeleting: async (_id, subject) => {
      if (asset.state !== 'ready' || subject !== owner) {
        return false
      }
      asset.state = 'deleting'
      return true
    },
    markDeleted: async () => {
      if (flags.databaseFailure) {
        throw new Error('SQL offline')
      }
      asset.state = 'deleted'
    },
    pendingDeletions: async () => (asset.state === 'deleting' ? [{ ...asset }] : []),
  })
  const catalog = {
    isAssetPublished: async () => false,
    isAssetReferenced: async () => {
      if (flags.catalogFailure) {
        throw new Error('catalog offline')
      }
      return flags.used
    },
  }
  return { asset, flags, assets, catalog }
}

test('DELETE protects other accounts, seeds and references, refuses outages, and is idempotent', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'file-delete-'))
  const state = deletionState()
  for (const name of ['original', 'preview', 'seed']) {
    await writeFile(join(directory, name), name === 'seed' ? 'seed' : 'audio')
  }
  const { app, bearer } = await buildTestApp({
    storageDir: directory,
    assets: state.assets,
    catalog: state.catalog,
  })
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true })
  })
  const url = `/assets/${fileId}`
  const remove = (headers: Record<string, string> = bearer(owner)) =>
    app.inject({ method: 'DELETE', url, headers })

  assert.equal((await remove({})).statusCode, 401)
  assert.equal((await remove(bearer(other))).statusCode, 404)
  const malformed = await app.inject({
    method: 'DELETE',
    url: '/assets/bad',
    headers: bearer(owner),
  })
  assert.deepEqual(malformed.json(), { error: 'invalid_request', message: 'Identifiant invalide.' })

  state.asset.uploaderUserId = null
  assert.equal((await remove()).statusCode, 404)
  state.asset.uploaderUserId = owner

  state.flags.used = true
  const inUse = await remove()
  assert.equal(inUse.statusCode, 409)
  assert.deepEqual(inUse.json(), {
    error: 'file_in_use',
    message: 'Ce fichier est encore utilisé dans le catalogue.',
  })
  assert.equal(state.asset.state, 'ready')
  assert.equal(await readFile(join(directory, 'original'), 'utf8'), 'audio')

  state.flags.used = false
  state.flags.catalogFailure = true
  const outage = await remove()
  assert.equal(outage.statusCode, 503)
  assert.equal(outage.json().error, 'file_deletion_unavailable')
  assert.equal(state.asset.state, 'ready')
  state.flags.catalogFailure = false

  const concurrent = await Promise.all([remove(), remove()])
  assert.deepEqual(
    concurrent.map((response) => response.statusCode),
    [204, 204]
  )
  assert.equal(state.asset.state, 'deleted')
  assert.deepEqual(await readdir(directory), ['seed'])
  assert.equal((await remove()).statusCode, 204)
  assert.equal(await readFile(join(directory, 'seed'), 'utf8'), 'seed')
})

test('an interrupted deletion stays deleting until recovery confirms it, even with bytes already gone', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'file-delete-recovery-'))
  const state = deletionState()
  t.after(() => rm(directory, { recursive: true }))
  await writeFile(join(directory, 'original'), 'audio')
  await writeFile(join(directory, 'preview'), 'audio')
  const deletions = createFileDeletionService({
    storageDir: directory,
    assets: state.assets,
    catalog: state.catalog,
  })

  state.flags.databaseFailure = true
  await assert.rejects(deletions.remove(owner, fileId))
  assert.equal(state.asset.state, 'deleting')
  assert.deepEqual(await readdir(directory), [])

  state.flags.databaseFailure = false
  assert.equal(await deletions.recover(), 1)
  assert.equal(state.asset.state, 'deleted')
  assert.equal(await deletions.recover(), 0)
})
