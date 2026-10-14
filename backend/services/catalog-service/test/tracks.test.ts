/**
 * @file tracks.test.ts
 * @brief Tests des routes `GET /tracks` et `GET /tracks/:id`.
 *
 * @details Ils vérifient ce qu'un client observe : paramètres invalides refusés avant toute lecture
 *   en base, pagination, morceau introuvable (404), panne de la base (503), et routes `/health`,
 *   `/ready` et `/metrics`.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toTrack } from '../src/domain/track.js'
import { buildTestApp, row, trackId } from './helpers.js'

/** @brief Faux résultat de liste vide, utilisé quand le contenu de la liste n'importe pas. */
const emptyList = async () => ({ rows: [], total: 0n, genres: [] })

test('list bounds and malformed parameters are refused before reading', async (t) => {
  let calls = 0
  const list = async () => {
    calls++
    return emptyList()
  }
  const app = await buildTestApp({ tracks: { findPublished: async () => null, list } })
  t.after(() => app.close())

  const refused = [
    'page=0',
    'page=-1',
    'page=1.5',
    'page=1e2',
    'pageSize=101',
    'pageSize=0',
    'page=9007199254740992',
    'page=9007199254740991&pageSize=100',
    'sort=no',
    'page=1&page=2',
    'genre=a&genre=b',
    'q=a&q=b',
    'unknown=x',
    `q=${'a'.repeat(201)}`,
  ]
  for (const query of refused) {
    const response = await app.inject(`/tracks?${query}`)
    assert.equal(response.statusCode, 400, query)
    assert.deepEqual(response.json(), { error: 'invalid_request' }, query)
  }
  assert.equal(calls, 0)

  const page = await app.inject('/tracks?page=2&pageSize=2&q=none&sort=artist')
  assert.equal(page.statusCode, 200)
  assert.deepEqual(page.json(), { items: [], total: 0, page: 2, pageSize: 2, genres: [] })
})

test('the list passes cleaned criteria and returns public tracks', async (t) => {
  let received: unknown
  const list = async (query: unknown) => {
    received = query
    return { rows: [row], total: 1n, genres: ['Demo'] }
  }
  const app = await buildTestApp({ tracks: { findPublished: async () => null, list } })
  t.after(() => app.close())

  const response = await app.inject('/tracks?q=%20aube%20&genre=Demo&sort=duration')
  assert.deepEqual(received, { page: 1, pageSize: 20, q: 'aube', genre: 'Demo', sort: 'duration' })
  assert.deepEqual(response.json(), {
    items: [toTrack(row)],
    total: 1,
    page: 1,
    pageSize: 20,
    genres: ['Demo'],
  })
})

test('a list storage failure is a controlled 503', async (t) => {
  const list = async () => {
    throw new Error('private SQL')
  }
  const app = await buildTestApp({ tracks: { findPublished: async () => null, list } })
  t.after(() => app.close())

  const response = await app.inject('/tracks')
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), { error: 'catalog_unavailable' })
})

test('detail: validation, missing track, outage and readiness', async (t) => {
  let calls = 0
  let unavailable = false
  let closed = false
  const findPublished = async (id: string) => {
    calls++
    if (unavailable) {
      throw new Error('private db detail')
    }
    return id === trackId ? row : null
  }
  const app = await buildTestApp({
    tracks: { findPublished, list: emptyList },
    ready: async () => {
      if (unavailable) {
        throw new Error('private db detail')
      }
    },
    close: async () => {
      closed = true
    },
  })

  assert.equal((await app.inject('/tracks/not-uuid')).statusCode, 400)
  assert.equal(calls, 0)

  const found = await app.inject(`/tracks/${trackId.toUpperCase()}`)
  assert.equal(found.statusCode, 200)
  assert.deepEqual(found.json(), toTrack(row))

  const missing = await app.inject('/tracks/20000000-0000-4000-8000-000000000099')
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), { error: 'track_not_found' })

  assert.equal((await app.inject('/ready')).statusCode, 200)
  assert.match((await app.inject('/metrics')).body, /catalog_service_/)

  unavailable = true
  const failure = await app.inject(`/tracks/${trackId}`)
  assert.equal(failure.statusCode, 503)
  assert.deepEqual(failure.json(), { error: 'catalog_unavailable' })
  assert.equal((await app.inject('/ready')).statusCode, 503)
  assert.equal((await app.inject('/health')).statusCode, 200)

  await app.close()
  assert.equal(closed, true)
})
