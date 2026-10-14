/**
 * @file profiles.test.ts
 * @brief Tests des routes de profil.
 *
 * @details Ils vérifient la lecture et la modification de son profil, le message d'erreur exact de
 *   chaque champ invalide, le refus d'un username déjà pris et le contenu du profil public.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeUsername } from '../src/domain/identifiers.js'
import { buildTestApp, memoryStores, newUserId, profileOf } from './helpers.js'

test('username normalization implements the canonical contract', () => {
  assert.equal(normalizeUsername(' Alice '), 'alice')
  assert.equal(normalizeUsername('ALICE_2'), 'alice_2')
  assert.equal(normalizeUsername('ab'), null)
  assert.equal(normalizeUsername('alice-2'), null)
  assert.equal(normalizeUsername(null), null)
})

test('GET /me returns exactly the allowed fields of the token owner', async (t) => {
  const userId = newUserId()
  const stranger = newUserId()
  const stored = {
    ...profileOf(userId, 'lea', { bio: 'Hello', avatarUrl: '/avatars/a.png' }),
    email: 'private@example.invalid',
    passwordHash: 'private',
  }
  const stores = memoryStores([stored, profileOf(stranger, 'bob')])
  const { app, bearer } = await buildTestApp({ profiles: stores.profilesRepository })
  t.after(() => app.close())

  const response = await app.inject({
    url: `/me?userId=${stranger}`,
    headers: { ...bearer(userId, { userId: stranger }), 'x-user-id': stranger },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    userId,
    displayName: 'LEA',
    username: 'lea',
    bio: 'Hello',
    avatarUrl: '/avatars/a.png',
  })

  const missing = await app.inject({ url: '/me', headers: bearer(newUserId()) })
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), { error: 'profile not found' })
})

test('private routes refuse a missing token or a subject that is not a UUID', async (t) => {
  const { app, bearer } = await buildTestApp()
  t.after(() => app.close())
  const refused: Record<string, string>[] = [
    {},
    { authorization: 'Bearer not-a-jwt' },
    bearer('not-a-uuid'),
    bearer(42),
    bearer(undefined),
  ]
  for (const headers of refused) {
    for (const url of ['/me', '/profiles', '/friends']) {
      const response = await app.inject({ url, headers })
      assert.equal(response.statusCode, 401)
      assert.deepEqual(response.json(), { error: 'unauthorized' })
    }
  }
})

test('PUT /me/profile normalizes values and uses only the JWT subject', async (t) => {
  const userId = newUserId()
  const stores = memoryStores([profileOf(userId, 'old')])
  const { app, bearer } = await buildTestApp({ profiles: stores.profilesRepository })
  t.after(() => app.close())
  const put = (payload: unknown) =>
    app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(userId),
      payload: payload as object,
    })

  const accepted = [
    [
      { displayName: ' Léa ', username: ' LEA_2 ', bio: ' Hello ', userId: newUserId() },
      { displayName: 'Léa', username: 'lea_2', bio: 'Hello' },
    ],
    [
      { displayName: 'Léa', username: 'lea', bio: '   ' },
      { displayName: 'Léa', username: 'lea', bio: null },
    ],
    [
      { displayName: 'a'.repeat(60), username: 'a'.repeat(24), bio: 'b'.repeat(160) },
      { displayName: 'a'.repeat(60), username: 'a'.repeat(24), bio: 'b'.repeat(160) },
    ],
  ] as const
  for (const [payload, values] of accepted) {
    const response = await put(payload)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { userId, ...values, avatarUrl: null })
    assert.deepEqual(stores.calls.update.at(-1), { userId, values })
  }
})

test('PUT /me/profile rejects invalid fields with the contract message, before any write', async (t) => {
  const userId = newUserId()
  const stores = memoryStores([profileOf(userId, 'old')])
  const { app, bearer } = await buildTestApp({ profiles: stores.profilesRepository })
  t.after(() => app.close())
  const valid = { displayName: 'Léa', username: 'lea', bio: null }
  const displayName = 'displayName must be between 1 and 60 chars'
  const username = 'username must match ^[a-z0-9_]{3,24}$'
  const bio = 'bio must be null or contain no more than 160 chars'
  const refused = [
    [{ ...valid, displayName: ' ' }, displayName],
    [{ ...valid, displayName: 'a'.repeat(61) }, displayName],
    [{ ...valid, displayName: 42 }, displayName],
    [{ ...valid, username: 'ab' }, username],
    [{ ...valid, username: 'a'.repeat(25) }, username],
    [{ ...valid, username: 'lea-2' }, username],
    [{ ...valid, username: 42 }, username],
    [{ ...valid, bio: 'b'.repeat(161) }, bio],
    [{ ...valid, bio: 42 }, bio],
    [{ displayName: 'Léa', username: 'lea' }, bio],
    [{}, displayName],
    [[], displayName],
  ] as const
  for (const [payload, error] of refused) {
    const response = await app.inject({
      method: 'PUT',
      url: '/me/profile',
      headers: bearer(userId),
      payload: payload as object,
    })
    assert.equal(response.statusCode, 400, JSON.stringify(payload))
    assert.deepEqual(response.json(), { error })
  }
  assert.equal(stores.calls.update.length, 0)
})

test('PUT /me/profile maps a username conflict to 409 and an unexpected failure to a generic 500', async (t) => {
  const userId = newUserId()
  const stores = memoryStores([profileOf(userId, 'lea'), profileOf(newUserId(), 'taken')])
  const { app, bearer } = await buildTestApp({ profiles: stores.profilesRepository })
  const broken = await buildTestApp({
    profiles: {
      ...stores.profilesRepository,
      update: async () => {
        throw new Error('private database detail')
      },
    },
  })
  t.after(async () => {
    await app.close()
    await broken.app.close()
  })
  const payload = { displayName: 'Léa', username: 'taken', bio: null }

  const conflict = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(userId),
    payload,
  })
  assert.equal(conflict.statusCode, 409)
  assert.deepEqual(conflict.json(), { error: 'username already in use' })

  const failure = await broken.app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: broken.bearer(userId),
    payload,
  })
  assert.equal(failure.statusCode, 500)
  assert.deepEqual(failure.json(), { error: 'internal server error' })
})

test('the public profile hides the bio and validates the identifier', async (t) => {
  const userId = newUserId()
  const stores = memoryStores([profileOf(userId, 'lea', { bio: 'private-ish' })])
  const { app } = await buildTestApp({ profiles: stores.profilesRepository })
  t.after(() => app.close())

  const found = await app.inject(`/profile/${userId}`)
  assert.deepEqual(found.json(), { userId, displayName: 'LEA', username: 'lea', avatarUrl: null })
  const malformed = await app.inject('/profile/nope')
  assert.equal(malformed.statusCode, 400)
  assert.deepEqual(malformed.json(), { error: 'invalid user id' })
  const missing = await app.inject(`/profile/${newUserId()}`)
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), { error: 'profile not found' })
  assert.match((await app.inject('/metrics')).body, /user_service_/)
  assert.equal((await app.inject('/ready')).statusCode, 200)
})
