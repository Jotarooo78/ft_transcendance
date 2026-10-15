/** Preuves HTTP des couches de publication, avec dépendances métier injectées. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DomainError } from '@ft/service-kit'
import { buildTestApp, row, trackId } from './helpers.js'
const userId = '11111111-1111-4111-8111-111111111111'
const profile = { userId, displayName: 'Current Artist', username: 'artist', avatarUrl: '/avatar' }
const data = { audioAssetId: trackId, title: ' Song ', description: 'Description' }

test('publication authenticates owner, reserves before writing and serializes artist, description and artwork', async (t) => {
  const calls: string[] = []
  const app = await buildTestApp({
    users: {
      authenticate: async () => {
        calls.push('identity')
        return profile
      },
      read: async () => profile,
    },
    media: {
      reserve: async (id, owner) => {
        assert.equal(id, trackId)
        assert.equal(owner, userId)
        calls.push('reserve')
        return { id, durationMs: 6000 }
      },
    },
    publications: {
      owners: async () => [],
      publish: async (body, owner, duration) => {
        assert.equal(body.title, 'Song')
        assert.equal(duration, 6000)
        calls.push('write')
        return { id: trackId, audioAssetId: trackId, createdByUserId: owner }
      },
    },
    tracks: {
      findPublished: async () => ({ ...row, artistUserId: userId, description: data.description }),
      list: async () => ({ rows: [], total: 0n, genres: [] }),
    },
  })
  t.after(() => app.close())
  const send = (payload: unknown, authorization?: string) =>
    app.inject({
      method: 'POST',
      url: '/tracks',
      payload,
      headers: authorization ? { authorization } : {},
    })
  assert.equal((await send(data)).statusCode, 401)
  assert.equal((await send({ ...data, artistUserId: userId }, 'Bearer session')).statusCode, 400)
  // Conserve les refus de limites et d’identité de la branche audio avant refactoring.
  for (const invalid of [
    { ...data, title: ' ' },
    { ...data, title: 'a'.repeat(201) },
    { ...data, description: 'a'.repeat(5001) },
    { ...data, createdByUserId: userId },
    { ...data, artistName: 'Someone else' },
    { ...data, audioAssetId: 'wrong' },
  ]) {
    assert.equal((await send(invalid, 'Bearer session')).statusCode, 400)
  }
  assert.deepEqual(calls, [])
  const result = await send(data, 'Bearer session')
  assert.equal(result.statusCode, 201, result.body)
  assert.deepEqual(calls, ['identity', 'reserve', 'write'])
  assert.equal(result.json().artistName, profile.displayName)
  assert.equal(result.json().artistUserId, userId)
  assert.equal(result.json().artistAvatarUrl, profile.avatarUrl)
  assert.equal(result.json().description, data.description)
  assert.match(result.json().coverUrl, /artwork$/)
})

test('an unavailable audio refuses publication before SQL', async (t) => {
  const app = await buildTestApp({
    users: { authenticate: async () => profile, read: async () => profile },
    media: {
      reserve: async () => {
        throw new DomainError(409, 'audio_not_available')
      },
    },
  })
  t.after(() => app.close())
  const result = await app.inject({
    method: 'POST',
    url: '/tracks',
    headers: { authorization: 'Bearer session' },
    payload: data,
  })
  assert.equal(result.statusCode, 409)
  assert.equal(result.json().error, 'audio_not_available')
})
