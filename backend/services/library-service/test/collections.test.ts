import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTestApp, owner, other, trackId, playlistId } from './helpers.js'
import type { CollectionsRepository } from '../src/repositories/collections.repository.js'

test('collections validate public targets, isolate accounts and keep kinds independent', async (t) => {
  const references = new Set<string>()
  const key = (user: string, kind: string, id: string) => `${user}:${kind}:${id}`
  let exists = true,
    reads = 0
  const repository: CollectionsRepository = {
    async list(user, kind) {
      reads++
      const items = [...references]
        .filter((value) => value.startsWith(`${user}:${kind}:`))
        .map((value) => ({ id: value.split(':')[2]!, createdAt: new Date().toISOString() }))
      return { items, total: items.length }
    },
    async save(user, kind, id) {
      references.add(key(user, kind, id))
    },
    async remove(user, kind, id) {
      references.delete(key(user, kind, id))
    },
  }
  const { app, bearer } = await buildTestApp({
    collections: { repository, targets: { exists: async () => exists } },
  })
  t.after(() => app.close())
  assert.equal((await app.inject('/collections/track')).statusCode, 401)
  assert.equal(reads, 0)
  const headers = bearer(owner)
  const command = (method: 'PUT' | 'DELETE', kind: string, id = trackId, subject = owner) =>
    app.inject({ method, url: `/collections/${kind}/${id}`, headers: bearer(subject) })
  const list = (kind: string, subject = owner) =>
    app.inject({ url: `/collections/${kind}?page=1&pageSize=20`, headers: bearer(subject) })
  for (const kind of ['track', 'project', 'artist']) {
    assert.equal((await command('PUT', kind)).statusCode, 204)
    assert.equal((await command('PUT', kind)).statusCode, 204)
    assert.equal((await list(kind)).json().total, 1)
    assert.equal((await list(kind, other)).json().total, 0)
  }
  assert.equal((await command('PUT', 'playlist', playlistId)).statusCode, 404)
  assert.equal((await command('PUT', 'friend')).statusCode, 400)
  assert.equal(
    (await app.inject({ url: '/collections/track?ownerUserId=' + other, headers })).statusCode,
    400
  )
  assert.equal(
    (await app.inject({ url: '/collections/track?pageSize=101', headers })).statusCode,
    400
  )
  assert.equal((await command('DELETE', 'track', trackId, other)).statusCode, 204)
  assert.equal((await list('track')).json().total, 1)
  exists = false
  assert.equal((await command('PUT', 'track')).statusCode, 404)
  assert.equal((await command('DELETE', 'track')).statusCode, 204)
  assert.equal((await command('DELETE', 'track')).statusCode, 204)
  assert.equal((await list('track')).json().total, 0)
  assert.equal((await list('project')).json().total, 1)
  assert.equal((await list('artist')).headers['cache-control'], 'no-store')
})
