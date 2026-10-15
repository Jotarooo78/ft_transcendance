/**
 * @file domain.test.ts
 * @brief Tests de la conversion d'une playlist vers sa forme publique, et du client qui interroge
 *   le catalogue.
 *
 * @details Pour tester le client, un petit serveur HTTP local joue le rôle du catalogue et renvoie
 *   successivement une réponse normale, un 404, une réponse incohérente, une erreur, puis aucune
 *   réponse.
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createCatalogClient } from '../src/clients/catalog.client.js'
import { toPlaylist } from '../src/domain/playlist.js'
import { createFakePlaylists, owner, trackId } from './helpers.js'

test('the playlist exposes its creator identity, a safe version and separate occurrences', () => {
  const items = [
    { id: 'item-a', trackId: 'same-track', position: 1 },
    { id: 'item-b', trackId: 'same-track', position: 3 },
  ]
  const row = {
    id: 'p',
    name: 'Private',
    description: null,
    version: 1n,
    items,
    ownerUserId: owner,
  }
  assert.deepEqual(toPlaylist(row), {
    id: 'p',
    ownerUserId: owner,
    name: 'Private',
    description: '',
    visibility: 'private',
    version: 1,
    items,
  })
  assert.throws(() => toPlaylist({ ...row, version: 9007199254740992n }))
  assert.throws(() => toPlaylist({ ...row, version: 0n }))
})

test('the service refuses to start without a JWT secret', async () => {
  const dependencies = {
    playlists: createFakePlaylists().repository,
    catalog: { isTrackPublished: async () => true },
    ready: async () => undefined,
    logger: false,
  }
  await assert.rejects(buildApp({ jwtSecret: '' }, dependencies), /JWT_SECRET/)
})

test('the Catalogue client distinguishes absent, malformed and timed-out tracks', async (t) => {
  let mode = 'ok'
  const server = createServer((_request, response) => {
    if (mode === 'timeout') {
      return
    }
    response.statusCode = mode === 'missing' ? 404 : mode === 'failure' ? 503 : 200
    response.end(JSON.stringify({ id: mode === 'bad' ? 'other' : trackId }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const catalog = createCatalogClient(`http://127.0.0.1:${address.port}`, 100)

  assert.equal(await catalog.isTrackPublished(trackId), true)
  mode = 'missing'
  assert.equal(await catalog.isTrackPublished(trackId), false)
  for (mode of ['bad', 'failure', 'timeout']) {
    await assert.rejects(catalog.isTrackPublished(trackId), mode)
  }
})
