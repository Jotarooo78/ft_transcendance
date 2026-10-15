/**
 * @file audio.test.ts
 * @brief Tests de l'écoute publique d'un morceau et du client qui interroge le catalogue.
 *
 * @details Ils vérifient notamment l'envoi d'une partie de fichier (en-tête `Range`), le refus d'un
 *   morceau non publié et la réponse en cas de panne du catalogue.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createCatalogClient } from '../src/clients/catalog.client.js'
import type { StoredFile } from '../src/domain/file.js'
import { demoAudio } from '../src/seed/audio-fixture.js'
import { buildTestApp, fakeAssets } from './helpers.js'

/** @brief Identifiant du fichier audio d'exemple. */
const id = '30000000-0000-4000-8000-000000000001'
/** @brief Adresse de la route d'écoute pour le fichier d'exemple. */
const path = `/assets/${id}/audio`
/** @brief Contenu du fichier audio d'exemple. */
const bytes = demoAudio(1)
/** @brief Informations en base du fichier audio d'exemple. */
const original: StoredFile = {
  id,
  uploaderUserId: null,
  purpose: 'audio',
  state: 'ready',
  storageKey: 'demo.wav',
  mimeType: 'audio/wav',
  byteSize: BigInt(bytes.length),
  durationMs: 6000n,
  checksumSha256: null,
}

test('real file bytes, metadata checks, confined paths and dependency errors', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'media-test-'))
  await writeFile(join(dir, 'demo.wav'), bytes)
  await symlink(join(dir, 'demo.wav'), join(dir, 'link.wav'))
  await mkdir(join(dir, 'directory'))
  const state = { asset: { ...original }, published: true, failure: false }
  const { app } = await buildTestApp({
    storageDir: dir,
    assets: fakeAssets({ find: async (value) => (value === id ? state.asset : null) }),
    catalog: {
      isAssetPublished: async () => {
        if (state.failure) {
          throw new Error('catalog')
        }
        return state.published
      },
      isAssetReferenced: async () => false,
    },
    ready: async () => {
      if (state.failure) {
        throw new Error('db')
      }
    },
  })
  t.after(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })

  const served = await app.inject(path)
  assert.equal(served.statusCode, 200)
  assert.deepEqual(served.rawPayload, bytes)
  assert.equal(served.headers['content-type'], 'audio/wav')
  assert.equal(served.headers['content-length'], String(bytes.length))
  assert.equal(served.headers['cache-control'], 'no-store')
  assert.equal(served.headers['accept-ranges'], 'bytes')
  const withBadToken = await app.inject({ url: path, headers: { authorization: 'Bearer invalid' } })
  assert.equal(withBadToken.statusCode, 200)
  assert.equal((await app.inject('/assets/no/audio')).statusCode, 400)
  const unknown = await app.inject('/assets/30000000-0000-4000-8000-000000000099/audio')
  assert.equal(unknown.statusCode, 404)

  const refused: Partial<StoredFile>[] = [
    { state: 'pending' },
    { purpose: 'avatar' },
    { storageKey: '../demo.wav' },
    { storageKey: 'a\\demo.wav' },
    { storageKey: '/demo.wav' },
    { storageKey: 'link.wav' },
    { storageKey: 'directory' },
    { storageKey: 'missing.wav' },
    { byteSize: 10n },
    { byteSize: null },
    { byteSize: 9007199254740992n },
    { mimeType: 'text/html' },
  ]
  for (const change of refused) {
    state.asset = { ...original, ...change }
    const response = await app.inject(path)
    assert.equal(response.statusCode, 404, Object.keys(change).join())
    assert.deepEqual(response.json(), { error: 'media_not_found' })
  }

  state.asset = original
  state.published = false
  assert.equal((await app.inject(path)).statusCode, 404)
  state.published = true
  state.failure = true
  const outage = await app.inject(path)
  assert.equal(outage.statusCode, 503)
  assert.deepEqual(outage.json(), { error: 'media_unavailable' })
  assert.equal((await app.inject('/ready')).statusCode, 503)
  assert.equal((await app.inject('/health')).statusCode, 200)
  assert.match((await app.inject('/metrics')).body, /media_service_/)
})

test('HEAD and closed, open, suffix and invalid byte ranges', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'media-range-'))
  await writeFile(join(dir, 'demo.wav'), bytes)
  let published = true
  const { app } = await buildTestApp({
    storageDir: dir,
    assets: fakeAssets({ find: async () => original }),
    catalog: { isAssetPublished: async () => published, isAssetReferenced: async () => false },
  })
  t.after(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })

  const satisfiable = [
    ['bytes=0-43', 0, 43],
    ['bytes=96043-96043', 96043, 96043],
    ['bytes=96040-', 96040, 96043],
    ['bytes=-4', 96040, 96043],
    ['bytes=-999999', 0, 96043],
    ['bytes=20-999999', 20, 96043],
  ] as const
  for (const [range, start, end] of satisfiable) {
    const response = await app.inject({ url: path, headers: { range } })
    assert.equal(response.statusCode, 206, range)
    assert.deepEqual(response.rawPayload, bytes.subarray(start, end + 1))
    assert.equal(response.headers['content-range'], `bytes ${start}-${end}/${bytes.length}`)
    assert.equal(response.headers['content-length'], String(end - start + 1))
    assert.equal(response.headers['accept-ranges'], 'bytes')
  }

  const unsatisfiable = [
    'bytes=',
    'bytes=-',
    'bytes=-0',
    'bytes=96044-',
    'bytes=4-3',
    'bytes=0-1,4-6',
    'items=1-2',
    'bytes=9007199254740992-',
    'bytes=0-9007199254740992',
    'bytes=1.5-3',
    'bytes=1e2-',
    'bytes= 0-3',
  ]
  for (const range of unsatisfiable) {
    const response = await app.inject({ url: path, headers: { range } })
    assert.equal(response.statusCode, 416, range)
    assert.equal(response.headers['content-range'], `bytes */${bytes.length}`)
    assert.deepEqual(response.json(), { error: 'invalid_range' })
  }

  for (const range of [undefined, 'bytes=0-1', 'invalid']) {
    const headers: Record<string, string> = range ? { range } : {}
    const response = await app.inject({ method: 'HEAD', url: path, headers })
    assert.equal(response.statusCode, 200)
    assert.equal(response.rawPayload.length, 0)
    assert.equal(response.headers['content-length'], String(bytes.length))
    assert.equal(response.headers['content-range'], undefined)
  }

  published = false
  for (const method of ['GET', 'HEAD'] as const) {
    const response = await app.inject({ method, url: path, headers: { range: 'bytes=0-43' } })
    assert.equal(response.statusCode, 404)
    if (method === 'HEAD') {
      assert.equal(response.rawPayload.length, 0)
    }
  }
})

test('the Catalogue client authenticates internal calls and refuses bad, failed or slow replies', async (t) => {
  let mode = 'true'
  let authorization = ''
  const server = createServer((request, response) => {
    authorization = request.headers.authorization ?? ''
    if (mode === 'timeout') {
      return
    }
    response.statusCode = mode === 'failure' ? 503 : 200
    const flag = mode === 'bad' ? 'yes' : mode === 'true'
    response.end(JSON.stringify({ published: flag, referenced: flag }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const catalog = createCatalogClient({
    baseUrl,
    internalToken: 'internal-test-token',
    timeoutMs: 2000,
  })

  assert.equal(await catalog.isAssetPublished(id), true)
  assert.equal(authorization, '')
  assert.equal(await catalog.isAssetReferenced(id), true)
  assert.equal(authorization, 'Bearer internal-test-token')
  mode = 'false'
  assert.equal(await catalog.isAssetPublished(id), false)
  assert.equal(await catalog.isAssetReferenced(id), false)
  for (mode of ['bad', 'failure', 'timeout']) {
    await assert.rejects(catalog.isAssetPublished(id), mode)
    await assert.rejects(catalog.isAssetReferenced(id), mode)
  }
  assert.throws(
    () => createCatalogClient({ baseUrl, internalToken: ' ' }),
    /INTERNAL_SERVICE_TOKEN/
  )
})
