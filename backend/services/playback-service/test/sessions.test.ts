/**
 * @file sessions.test.ts
 * @brief Tests des routes de sessions d'écoute et du client qui interroge le catalogue.
 *
 * @details Ils vérifient ce qu'un client observe : refus sans jeton valide, refus des corps
 *   invalides, impossibilité d'agir sur la session d'un autre compte, et réponse 503 quand le
 *   catalogue ou la base est en panne.
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createCatalogClient } from '../src/clients/catalog.client.js'
import { progressConflict } from '../src/domain/errors.js'
import { recordProgress } from '../src/domain/progress.js'
import { toHistorySession, toSession, type HistoryRow } from '../src/domain/session.js'
import {
  buildTestApp,
  fakeSessions,
  memoryTransaction,
  owner,
  row,
  sessionId,
  start,
  trackId,
} from './helpers.js'

test('opening uses verified identity and catalogue duration; refusals write nothing', async (t) => {
  const state = {
    writes: 0,
    lookups: 0,
    duration: 6000 as number | null,
    outage: false,
    closed: false,
  }
  const sessions = {
    ...fakeSessions(),
    create: async (subject: string, track: string, durationMs: number) => {
      assert.deepEqual([subject, track, durationMs], [owner, trackId, 6000])
      state.writes++
      return row
    },
  }
  const catalog = {
    readTrackDuration: async (id: string) => {
      state.lookups++
      assert.equal(id, trackId)
      if (state.outage) {
        throw new Error('Catalogue down')
      }
      return state.duration
    },
  }
  const { app, bearer } = await buildTestApp({
    sessions,
    catalog,
    ready: async () => {
      if (state.outage) {
        throw new Error('DB down')
      }
    },
    close: async () => {
      state.closed = true
    },
  })
  const headers = bearer(owner)
  const open = (payload: object, withHeaders: Record<string, string> = headers) =>
    app.inject({ method: 'POST', url: '/sessions', headers: withHeaders, payload })

  const refusedTokens = [
    undefined,
    'invalid',
    app.jwt.sign({ sub: 'bad' }),
    app.jwt.sign({ sub: owner, exp: 1 }),
  ]
  for (const token of refusedTokens) {
    const withHeaders: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {}
    assert.equal((await open({ trackId }, withHeaders)).statusCode, 401)
  }
  const refusedBodies = [
    {},
    { trackId: 'bad' },
    { trackId, userId: owner },
    { trackId, trackDurationMs: 1 },
    { trackId, startedAt: 'now' },
  ]
  for (const payload of refusedBodies) {
    assert.equal((await open(payload)).statusCode, 400)
  }
  assert.equal(state.lookups, 0)
  assert.equal(state.writes, 0)

  state.duration = null
  const missing = await open({ trackId })
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), { error: 'track_not_found' })
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    state.duration = value
    assert.equal((await open({ trackId })).statusCode, 503)
  }
  state.outage = true
  const outage = await open({ trackId })
  assert.equal(outage.statusCode, 503)
  assert.deepEqual(outage.json(), { error: 'playback_unavailable' })
  assert.equal((await app.inject('/ready')).statusCode, 503)
  assert.equal((await app.inject('/health')).statusCode, 200)
  assert.equal(state.writes, 0)

  state.outage = false
  state.duration = 6000
  const created = await open({ trackId })
  assert.equal(created.statusCode, 201)
  assert.equal(created.headers['cache-control'], 'no-store')
  assert.deepEqual(created.json(), toSession(row))
  assert.equal(created.json().qualified, undefined)
  assert.equal(state.writes, 1)
  assert.match((await app.inject('/metrics')).body, /playback_service_/)

  await app.close()
  assert.equal(state.closed, true)
  assert.throws(() => toSession({ ...row, trackDurationMs: BigInt(Number.MAX_SAFE_INTEGER) + 1n }))
})

test('progress validates the request shape before the writer and preserves business errors', async (t) => {
  let writes = 0
  const sessions = {
    ...fakeSessions(),
    withLock: async (subject: string, id: string) => {
      assert.deepEqual([subject, id], [owner, sessionId])
      writes++
      throw progressConflict()
    },
  }
  const { app, bearer } = await buildTestApp({ sessions })
  t.after(() => app.close())
  const headers = bearer(owner)
  const url = `/sessions/${sessionId}/progress`
  const valid = { sequence: 1, positionMs: 1000, listenedMsTotal: 1000 }
  const put = (payload: object, withHeaders: Record<string, string> = headers) =>
    app.inject({ method: 'PUT', url, headers: withHeaders, payload })

  assert.equal((await put(valid, {})).statusCode, 401)
  const refused = [
    { ...valid, sequence: 0 },
    { ...valid, sequence: 2147483648 },
    { ...valid, positionMs: -1 },
    { ...valid, listenedMsTotal: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, listenedMsTotal: 1.5 },
    { ...valid, userId: owner },
    { sequence: 1, positionMs: 1000 },
  ]
  for (const payload of refused) {
    assert.equal((await put(payload)).statusCode, 400, JSON.stringify(payload))
  }
  assert.equal(writes, 0)

  const conflict = await put(valid)
  assert.equal(conflict.statusCode, 409)
  assert.deepEqual(conflict.json(), { error: 'progress_conflict' })
  assert.equal(writes, 1)
})

test('close belongs to the subject, is terminal and idempotent without invented time', async (t) => {
  const memory = memoryTransaction()
  const input = { sequence: 1, positionMs: 1000, listenedMsTotal: 1000 }
  await recordProgress(memory.tx, input, () => start + 1000)
  const { app, bearer } = await buildTestApp({ sessions: fakeSessions(memory) })
  t.after(() => app.close())
  const headers = bearer(owner)
  const url = `/sessions/${sessionId}/close`
  const post = (target: string, withHeaders: Record<string, string>, payload?: object) =>
    app.inject({ method: 'POST', url: target, headers: withHeaders, payload })

  assert.equal((await post(url, {})).statusCode, 401)
  assert.equal((await post(url, headers, { endedAt: 'forged' })).statusCode, 400)
  assert.equal((await post(url, bearer(trackId))).statusCode, 404)
  assert.equal((await post(`/sessions/${trackId}/close`, headers)).statusCode, 404)
  assert.equal((await post('/sessions/no/close', headers)).statusCode, 400)
  assert.equal(memory.counts.closures, 0)

  const closed = await post(url, headers, {})
  assert.equal(closed.statusCode, 200)
  assert.equal(closed.json().listenedMs, 1000)
  assert.notEqual(closed.json().endedAt, null)
  assert.deepEqual((await post(url, headers)).json(), closed.json())
  assert.equal(memory.counts.closures, 1)
  assert.equal(memory.events.size, 1)
  assert.equal(memory.counts.summaries, 1)

  const progress = (payload: object) =>
    app.inject({ method: 'PUT', url: `/sessions/${sessionId}/progress`, headers, payload })
  assert.equal((await progress({ ...input, sequence: 2 })).statusCode, 409)
  assert.deepEqual((await progress(input)).json(), closed.json())
})

test('history validates bounded pagination and uses only the verified subject', async (t) => {
  const closedRow: HistoryRow = {
    ...row,
    endedAt: new Date(start + 3000),
    listenedMs: 2000n,
    lastSequence: 2,
    events: [{ sequence: 2, positionMs: 5000n }],
  }
  const openRow: HistoryRow = { ...row, id: trackId, events: [] }
  const state = { reads: 0, outage: false }
  const sessions = {
    ...fakeSessions(),
    history: async (subject: string, { page, pageSize }: { page: number; pageSize: number }) => {
      state.reads++
      if (state.outage) {
        throw new Error('DB down')
      }
      const rows = subject === owner ? [closedRow, openRow] : []
      return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
    },
  }
  const { app, bearer } = await buildTestApp({ sessions })
  t.after(() => app.close())
  const headers = bearer(owner)
  const get = (url: string, withHeaders: Record<string, string> = headers) =>
    app.inject({ url, headers: withHeaders })

  assert.equal((await get('/sessions', {})).statusCode, 401)
  const refused = [
    'page=0',
    'pageSize=101',
    'page=1.2',
    'page=9007199254740991',
    `userId=${owner}`,
    'page=1&page=2',
  ]
  for (const query of refused) {
    assert.equal((await get(`/sessions?${query}`)).statusCode, 400, query)
  }
  assert.equal(state.reads, 0)

  const first = await get('/sessions?page=1&pageSize=1')
  assert.equal(first.statusCode, 200)
  assert.equal(first.headers['cache-control'], 'no-store')
  assert.deepEqual(first.json(), {
    page: 1,
    pageSize: 1,
    total: 2,
    items: [toHistorySession(closedRow)],
  })
  assert.equal(first.json().items[0].qualified, undefined)
  const second = (await get('/sessions?page=2&pageSize=1')).json()
  assert.equal(second.items[0].positionMs, 0)
  assert.equal(second.items[0].endedAt, null)
  assert.deepEqual((await get('/sessions?page=3&pageSize=1')).json().items, [])

  const stranger = await get('/sessions', bearer(trackId))
  assert.deepEqual(stranger.json().items, [])
  assert.equal(stranger.json().total, 0)

  state.outage = true
  assert.equal((await get('/sessions')).statusCode, 503)
  assert.throws(() => toHistorySession({ ...row, lastSequence: 1, events: [] }))
})

test('the service refuses to start without a JWT secret', async () => {
  const dependencies = {
    sessions: fakeSessions(),
    catalog: { readTrackDuration: async () => 6000 },
    ready: async () => undefined,
    logger: false,
  }
  await assert.rejects(buildApp({ jwtSecret: '' }, dependencies), /JWT_SECRET/)
})

test('the Catalogue client bounds time and validates duration and identity', async (t) => {
  const reply = { status: 200, payload: { id: trackId, durationMs: 6000 } as unknown, hold: false }
  const server = createServer((_request, response) => {
    if (reply.hold) {
      return
    }
    response.writeHead(reply.status, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(reply.payload))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const catalog = createCatalogClient(`http://127.0.0.1:${address.port}`, 100)

  assert.equal(await catalog.readTrackDuration(trackId), 6000)
  reply.status = 404
  assert.equal(await catalog.readTrackDuration(trackId), null)
  reply.status = 503
  await assert.rejects(catalog.readTrackDuration(trackId))
  reply.status = 200
  const invalid = [
    { id: owner, durationMs: 6000 },
    { id: trackId, durationMs: null },
    { id: trackId, durationMs: 0 },
    { id: trackId, durationMs: '6000' },
  ]
  for (const payload of invalid) {
    reply.payload = payload
    await assert.rejects(catalog.readTrackDuration(trackId))
  }
  reply.hold = true
  await assert.rejects(catalog.readTrackDuration(trackId))
})
