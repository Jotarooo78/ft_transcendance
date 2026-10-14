/**
 * @file playlist-items.test.ts
 * @brief Tests de l'ajout et du retrait d'un morceau dans une playlist.
 *
 * @details Ils vérifient en particulier l'ordre des refus à l'ajout, que le catalogue n'est pas
 *   interrogé inutilement, et que le même morceau peut être ajouté deux fois puis retiré une seule
 *   fois.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildTestApp,
  createFakePlaylists,
  emptyRow,
  other,
  owner,
  playlistId,
  trackId,
} from './helpers.js'

test('adding an occurrence checks owner, version and Catalogue before writing', async (t) => {
  const { repository, state } = createFakePlaylists()
  const catalogState = { lookups: 0, available: true, outage: false }
  const catalog = {
    isTrackPublished: async () => {
      catalogState.lookups++
      if (catalogState.outage) {
        throw new Error('timeout')
      }
      return catalogState.available
    },
  }
  const { app, bearer } = await buildTestApp({ playlists: repository, catalog })
  t.after(() => app.close())
  const headers = bearer(owner)
  const url = `/playlists/${playlistId}/items`
  const payload = { trackId, expectedVersion: 1 }
  const add = (body: object, withHeaders = headers) =>
    app.inject({ method: 'POST', url, headers: withHeaders, payload: body })

  assert.equal((await add(payload, bearer(other))).statusCode, 404)
  assert.equal((await add({ ...payload, expectedVersion: 2 })).statusCode, 409)
  assert.equal(catalogState.lookups, 0)
  assert.equal(state.writes, 0)

  const invalid = [
    { trackId },
    { ...payload, trackId: 'no' },
    { ...payload, expectedVersion: 0 },
    { ...payload, expectedVersion: 1.5 },
    { ...payload, ownerUserId: other },
  ]
  for (const body of invalid) {
    assert.equal((await add(body)).statusCode, 400, JSON.stringify(body))
  }

  catalogState.available = false
  const missing = await add(payload)
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), { error: 'track_not_found' })
  catalogState.available = true
  catalogState.outage = true
  const outage = await add(payload)
  assert.equal(outage.statusCode, 503)
  assert.deepEqual(outage.json(), { error: 'library_unavailable' })
  catalogState.outage = false
  assert.equal(state.writes, 0)

  assert.equal((await add(payload)).statusCode, 200)
  const second = await add({ ...payload, expectedVersion: 2 })
  assert.equal(second.statusCode, 200)
  assert.equal(second.json().version, 3)
  const items = second.json().items as { id: string; trackId: string }[]
  assert.deepEqual(
    items.map((item) => item.trackId),
    [trackId, trackId]
  )
  assert.notEqual(items[0]?.id, items[1]?.id)
})

test('remove targets one occurrence, checks version and never requires Catalogue', async (t) => {
  const item1 = '60000000-0000-4000-8000-000000000001'
  const item2 = '60000000-0000-4000-8000-000000000002'
  const foreignItem = '60000000-0000-4000-8000-000000000003'
  const { repository, state } = createFakePlaylists({
    ...emptyRow(),
    items: [
      { id: item1, trackId: 'same', position: 1 },
      { id: item2, trackId: 'same', position: 2 },
    ],
  })
  let lookups = 0
  const catalog = {
    isTrackPublished: async () => {
      lookups++
      throw new Error('Catalogue down')
    },
  }
  const { app, bearer } = await buildTestApp({ playlists: repository, catalog })
  t.after(() => app.close())
  const headers = bearer(owner)
  const remove = (
    itemId: string,
    expectedVersion: number,
    withHeaders: Record<string, string> = headers
  ) =>
    app.inject({
      method: 'DELETE',
      url: `/playlists/${playlistId}/items/${itemId}`,
      headers: withHeaders,
      payload: { expectedVersion },
    })

  assert.equal((await remove(item1, 1, {})).statusCode, 401)
  assert.equal((await remove(item1, 1, bearer(other))).statusCode, 404)
  const foreign = await remove(foreignItem, 1)
  assert.equal(foreign.statusCode, 404)
  assert.deepEqual(foreign.json(), { error: 'item_not_found' })
  assert.equal((await remove(item1, 2)).statusCode, 409)
  assert.equal(state.writes, 0)

  const removed = await remove(item1, 1)
  assert.equal(removed.statusCode, 200)
  assert.equal(removed.json().version, 2)
  assert.deepEqual(removed.json().items, [{ id: item2, trackId: 'same', position: 2 }])
  assert.equal((await remove(item1, 1)).statusCode, 409)
  assert.equal((await remove(item1, 2)).statusCode, 404)
  assert.equal(state.writes, 1)
  assert.equal(lookups, 0)
})
