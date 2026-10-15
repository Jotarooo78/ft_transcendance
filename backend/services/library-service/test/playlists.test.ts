/**
 * @file playlists.test.ts
 * @brief Tests des routes de playlists.
 *
 * @details Ils vérifient ce qu'un client observe : refus sans jeton valide, impossibilité de voir
 *   ou de modifier la playlist d'un autre compte, refus des corps invalides, détection d'une
 *   version périmée, et réponse 503 quand la base est en panne.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTestApp, createFakePlaylists, other, owner, playlistId, emptyRow } from './helpers.js'

/** @brief Forme attendue de la playlist d'exemple dans une réponse. */
const playlist = {
  id: playlistId,
  name: 'Private',
  description: '',
  visibility: 'private',
  version: 1,
  items: [],
}

test('JWT verification precedes storage and ownership scopes every read', async (t) => {
  const { repository, state } = createFakePlaylists()
  let reads = 0
  const playlists = {
    ...repository,
    list: (...args: Parameters<typeof repository.list>) => {
      reads++
      return repository.list(...args)
    },
    find: (...args: Parameters<typeof repository.find>) => {
      reads++
      return repository.find(...args)
    },
  }
  const { app, bearer } = await buildTestApp({ playlists })
  const foreign = await buildTestApp({}, 'another-test-secret')
  t.after(async () => {
    await app.close()
    await foreign.app.close()
  })

  const refusedTokens = [
    undefined,
    'not-a-jwt',
    foreign.app.jwt.sign({ sub: owner }),
    app.jwt.sign({ sub: owner, exp: 1 }),
    app.jwt.sign({ sub: 'not-uuid' }),
    app.jwt.sign({}),
    app.jwt.sign({ sub: 123 }),
  ]
  for (const token of refusedTokens) {
    const headers = token ? { authorization: `Bearer ${token}` } : {}
    for (const url of ['/playlists', `/playlists/${playlistId}`]) {
      const response = await app.inject({ url, headers })
      assert.equal(response.statusCode, 401)
      assert.deepEqual(response.json(), { error: 'unauthorized' })
    }
  }
  assert.equal(reads, 0)

  const headers = bearer(owner)
  assert.deepEqual(
    (await app.inject({ url: `/playlists/${playlistId}`, headers })).json(),
    playlist
  )
  const list = await app.inject({ url: '/playlists?pageSize=1', headers })
  assert.equal(list.statusCode, 200)
  assert.equal(list.headers['cache-control'], 'no-store')
  assert.deepEqual(list.json(), { items: [playlist], total: 1, page: 1, pageSize: 1 })

  const stranger = bearer(other)
  assert.equal(
    (await app.inject({ url: `/playlists/${playlistId}`, headers: stranger })).statusCode,
    404
  )
  assert.deepEqual((await app.inject({ url: '/playlists', headers: stranger })).json().items, [])

  const refusedQueries = [
    'page=0',
    'page=-1',
    'page=1.1',
    'pageSize=101',
    'page=1&page=2',
    'ownerUserId=x',
    'page=9007199254740992',
    'page=9007199254740991&pageSize=100',
  ]
  for (const query of refusedQueries) {
    assert.equal((await app.inject({ url: `/playlists?${query}`, headers })).statusCode, 400, query)
  }
  assert.equal((await app.inject({ url: '/playlists/no', headers })).statusCode, 400)

  state.failure = true
  for (const url of ['/playlists', `/playlists/${playlistId}`]) {
    const response = await app.inject({ url, headers })
    assert.equal(response.statusCode, 503)
    assert.deepEqual(response.json(), { error: 'library_unavailable' })
  }
  assert.equal((await app.inject('/health')).statusCode, 200)
  assert.equal((await app.inject('/ready')).statusCode, 200)
  assert.match((await app.inject('/metrics')).body, /library_service_/)
})

test('create uses the authenticated owner and validates the entire body', async (t) => {
  const { repository, state } = createFakePlaylists(null)
  const { app, bearer } = await buildTestApp({ playlists: repository })
  t.after(() => app.close())
  const headers = bearer(owner)
  const create = (payload: unknown, withHeaders = headers) =>
    app.inject({
      method: 'POST',
      url: '/playlists',
      headers: withHeaders,
      payload: payload as object,
    })

  assert.equal((await create({ name: 'Unauthenticated' }, {} as typeof headers)).statusCode, 401)
  const refused = [
    {},
    [],
    { name: '' },
    { name: '   ' },
    { name: 'x'.repeat(101) },
    { name: 'ok', description: 'x'.repeat(2001) },
    { name: 'ok', description: null },
    { name: 'ok', ownerUserId: other },
    { name: 'ok', visibility: 'unlisted' },
    { name: 'ok', version: 5 },
  ]
  for (const payload of refused) {
    const response = await create(payload)
    assert.equal(response.statusCode, 400, JSON.stringify(payload))
    assert.deepEqual(response.json(), { error: 'invalid_request' })
  }
  assert.equal(state.writes, 0)

  const created = await create({ name: '  Empty playlist  ', description: '  Notes  ' })
  assert.equal(created.statusCode, 201)
  assert.deepEqual(created.json(), { ...playlist, name: 'Empty playlist', description: 'Notes' })
  const read = await app.inject({ url: `/playlists/${playlistId}`, headers })
  assert.deepEqual(read.json(), created.json())

  const emoji = await create({ name: '🎵'.repeat(100) })
  assert.equal(emoji.statusCode, 201)
  assert.equal((await create({ name: '🎵'.repeat(101) })).statusCode, 400)

  state.failure = true
  const outage = await create({ name: 'Later' })
  assert.equal(outage.statusCode, 503)
  assert.deepEqual(outage.json(), { error: 'library_unavailable' })
})

test('edit validates all fields before an atomic versioned update', async (t) => {
  const { repository, state } = createFakePlaylists()
  const { app, bearer } = await buildTestApp({ playlists: repository })
  t.after(() => app.close())
  const headers = bearer(owner)
  const url = `/playlists/${playlistId}`
  const patch = (payload: object, withHeaders = headers) =>
    app.inject({ method: 'PATCH', url, headers: withHeaders, payload })

  const refused = [
    { expectedVersion: 1 },
    { expectedVersion: 1, name: ' ', description: 'valid' },
    { expectedVersion: 1, name: 'valid', description: 'x'.repeat(2001) },
    { expectedVersion: 1, name: 'valid', ownerUserId: other },
    { expectedVersion: 1, description: 'valid', visibility: 'unlisted' },
    { name: 'valid' },
    { name: 'valid', expectedVersion: 0 },
  ]
  for (const payload of refused) {
    assert.equal((await patch(payload)).statusCode, 400, JSON.stringify(payload))
  }
  assert.equal(state.writes, 0)
  assert.deepEqual(state.row, emptyRow())

  assert.equal((await patch({ name: 'rename', expectedVersion: 2 })).statusCode, 409)
  assert.equal((await patch({ name: 'rename', expectedVersion: 1 }, bearer(other))).statusCode, 404)
  state.failure = true
  assert.equal((await patch({ name: 'rename', expectedVersion: 1 })).statusCode, 503)
  assert.equal(state.writes, 0)
  state.failure = false

  const updated = await patch({ name: ' Renamed ', description: ' Notes ', expectedVersion: 1 })
  assert.equal(updated.statusCode, 200)
  assert.deepEqual(updated.json(), {
    ...playlist,
    name: 'Renamed',
    description: 'Notes',
    version: 2,
  })

  const descriptionOnly = await patch({ description: '', expectedVersion: 2 })
  assert.equal(descriptionOnly.statusCode, 200)
  assert.equal(descriptionOnly.json().name, 'Renamed')
  assert.equal(descriptionOnly.json().description, '')
  assert.equal(descriptionOnly.json().version, 3)
})

test('delete requires ownership and the current version; repeats are explicit 404', async (t) => {
  const { repository, state } = createFakePlaylists()
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
  const remove = (url: string, payload: unknown, withHeaders: Record<string, string> = headers) =>
    app.inject({ method: 'DELETE', url, headers: withHeaders, payload: payload as object })
  const url = `/playlists/${playlistId}`
  const payload = { expectedVersion: 1 }

  assert.equal((await remove(url, payload, {})).statusCode, 401)
  assert.equal((await remove(url, { expectedVersion: 2 })).statusCode, 409)
  assert.equal((await remove(url, payload, bearer(other))).statusCode, 404)
  assert.equal((await remove(`/playlists/${other}`, payload)).statusCode, 404)
  for (const invalid of [
    undefined,
    {},
    { expectedVersion: 0 },
    { expectedVersion: 1, extra: true },
  ]) {
    assert.equal((await remove(url, invalid)).statusCode, 400)
  }
  assert.equal(state.writes, 0)

  const removed = await remove(url, payload)
  assert.equal(removed.statusCode, 204)
  assert.equal(removed.body, '')
  assert.equal((await remove(url, payload)).statusCode, 404)
  assert.equal(state.writes, 1)
  assert.equal(lookups, 0)
})

test('public link is revoked immediately; owner can still edit and strangers cannot', async (t) => {
  const fake = createFakePlaylists()
  const { app, bearer } = await buildTestApp({ playlists: fake.repository })
  t.after(() => app.close())
  const url = `/public/playlists/${playlistId}`
  assert.equal((await app.inject(url)).statusCode, 404)
  const patch = (visibility: string, expectedVersion: number, subject = owner) =>
    app.inject({
      method: 'PATCH',
      url: `/playlists/${playlistId}`,
      headers: bearer(subject),
      payload: { visibility, expectedVersion },
    })
  assert.equal((await patch('public', 1, other)).statusCode, 404)
  assert.equal((await patch('public', 1)).statusCode, 200)
  const shared = await app.inject(url)
  assert.equal(shared.statusCode, 200)
  assert.equal(shared.headers['cache-control'], 'no-store')
  assert.equal(shared.json().visibility, 'public')
  assert.equal(shared.json().ownerUserId, undefined)
  assert.equal((await patch('private', 1)).statusCode, 409)
  assert.equal((await patch('private', 2)).statusCode, 200)
  assert.equal((await app.inject(url)).statusCode, 404)
  assert.equal(
    (await app.inject({ url: `/playlists/${playlistId}`, headers: bearer(owner) })).statusCode,
    200
  )
})
