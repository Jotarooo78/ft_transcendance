/**
 * @file assets.test.ts
 * @brief Tests des deux routes que media-service appelle, et du repository qui cherche un fichier
 *   dans le catalogue.
 *
 * @details Ils vérifient notamment que la route interne refuse tout appel sans le bon jeton, et
 *   qu'une panne de la base donne un refus (503) plutôt qu'une réponse qui autoriserait à tort une
 *   suppression.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createAssetsRepository } from '../src/repositories/assets.repository.js'
import { buildTestApp, config, row, trackId } from './helpers.js'

/** @brief Identifiant du fichier d'exemple. */
const assetId = '33333333-3333-4333-8333-333333333333'

test('asset publication reveals only a boolean and distinguishes outages', async (t) => {
  let failed = false
  const isPublished = async (id: string) => {
    if (failed) {
      throw new Error('SQL')
    }
    return id === row.audioAssetId
  }
  const app = await buildTestApp({ assets: { isPublished, isReferenced: async () => false } })
  t.after(() => app.close())

  assert.equal((await app.inject('/assets/no/publication')).statusCode, 400)
  const published = await app.inject(`/assets/${row.audioAssetId}/publication`)
  assert.deepEqual(published.json(), { published: true })
  assert.equal(published.headers['cache-control'], 'no-store')
  assert.deepEqual((await app.inject(`/assets/${trackId}/publication`)).json(), {
    published: false,
  })

  failed = true
  assert.equal((await app.inject(`/assets/${trackId}/publication`)).statusCode, 503)
})

test('the reference lookup covers audio, cover and artist image, drafts included', async () => {
  const calls: unknown[] = []
  let selected = ''
  const query = (kind: string) => async (args: unknown) => {
    calls.push(args)
    return selected === kind ? { id: assetId } : null
  }
  const database = {
    track: { findFirst: query('audio') },
    release: { findFirst: query('cover') },
    artist: { findFirst: query('image') },
  } as unknown as Parameters<typeof createAssetsRepository>[0]
  const assets = createAssetsRepository(database)

  for (selected of ['', 'audio', 'cover', 'image']) {
    calls.length = 0
    assert.equal(await assets.isReferenced(assetId), selected !== '')
    assert.deepEqual(calls, [
      { where: { audioAssetId: assetId }, select: { id: true } },
      { where: { coverAssetId: assetId }, select: { id: true } },
      { where: { imageAssetId: assetId }, select: { id: true } },
    ])
  }
})

test('internal references require the service token and fail closed', async (t) => {
  let reads = 0
  let failure = false
  let referenced = false
  const isReferenced = async () => {
    reads++
    if (failure) {
      throw new Error('SQL')
    }
    return referenced
  }
  const app = await buildTestApp({ assets: { isPublished: async () => false, isReferenced } })
  t.after(() => app.close())
  const url = `/internal/assets/${assetId}/references`

  for (const authorization of [
    undefined,
    'Bearer invalid',
    'Bearer',
    'Bearer internal-test-tokeX',
  ]) {
    const headers = authorization ? { authorization } : {}
    assert.equal((await app.inject({ url, headers })).statusCode, 401)
  }
  assert.equal(reads, 0)

  const headers = { authorization: 'Bearer internal-test-token' }
  for (referenced of [false, true]) {
    const response = await app.inject({ url, headers })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { referenced })
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  assert.equal(
    (await app.inject({ url: '/internal/assets/bad/references', headers })).statusCode,
    400
  )

  failure = true
  assert.equal((await app.inject({ url, headers })).statusCode, 503)
})

test('the service refuses to start without an internal token', async () => {
  const unused = async (): Promise<never> => {
    throw new Error('Unexpected call')
  }
  const dependencies = {
    users: { authenticate: unused, read: unused },
    media: { reserve: unused, release: unused },
    publications: { owners: async () => [], publish: unused },
    tracks: {
      findPublished: async () => null,
      list: async () => ({ rows: [], total: 0n, genres: [] }),
    },
    assets: { isPublished: async () => false, isReferenced: async () => false },
    ready: async () => undefined,
    logger: false,
  }
  await assert.rejects(
    buildApp({ ...config, internalServiceToken: ' ' }, dependencies),
    /INTERNAL_SERVICE_TOKEN/
  )
})
