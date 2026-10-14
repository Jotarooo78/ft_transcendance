/**
 * @file social.test.ts
 * @brief Tests des amitiés, de l'annuaire des utilisateurs et de la présence en ligne.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { onlineStatus } from '../src/domain/presence.js'
import { buildTestApp, memoryStores, newUserId, profileOf } from './helpers.js'

test('a presence is online only when declared and seen within two minutes', () => {
  const now = Date.now()
  const seen = (secondsAgo: number, isOnline = true) => ({
    isOnline,
    lastSeenAt: new Date(now - secondsAgo * 1000),
  })
  assert.equal(onlineStatus(seen(0), now), 'online')
  assert.equal(onlineStatus(seen(120), now), 'online')
  assert.equal(onlineStatus(seen(121), now), 'offline')
  assert.equal(onlineStatus(seen(0, false), now), 'offline')
  assert.equal(onlineStatus(null, now), 'offline')
})

test('friendship is mutual, idempotent and guarded', async (t) => {
  const [lea, bob] = [newUserId(), newUserId()]
  const stores = memoryStores([profileOf(lea, 'lea'), profileOf(bob, 'bob')])
  const { app, bearer } = await buildTestApp({
    profiles: stores.profilesRepository,
    social: stores.socialRepository,
  })
  t.after(() => app.close())
  const call = (method: 'POST' | 'DELETE', friendId: string, subject = lea) =>
    app.inject({ method, url: `/friends/${friendId}`, headers: bearer(subject) })

  assert.equal((await app.inject({ method: 'POST', url: `/friends/${bob}` })).statusCode, 401)
  assert.deepEqual((await call('POST', 'nope')).json(), { error: 'invalid friend id' })
  assert.deepEqual((await call('POST', lea)).json(), { error: 'cannot add yourself' })
  const unknown = await call('POST', newUserId())
  assert.equal(unknown.statusCode, 404)
  assert.deepEqual(unknown.json(), { error: 'friend profile not found' })
  assert.equal(stores.links.size, 0)

  assert.deepEqual((await call('POST', bob)).json(), { ok: true })
  assert.deepEqual((await call('POST', bob)).json(), { ok: true })
  assert.equal(stores.links.size, 2)

  await app.inject({ method: 'POST', url: '/presence/heartbeat', headers: bearer(bob) })
  const friendsOfLea = (await app.inject({ url: '/friends', headers: bearer(lea) })).json()
  assert.equal(friendsOfLea.friends.length, 1)
  assert.equal(friendsOfLea.friends[0].userId, bob)
  assert.equal(friendsOfLea.friends[0].onlineStatus, 'online')
  assert.equal(typeof friendsOfLea.friends[0].lastSeenAt, 'string')
  const friendsOfBob = (await app.inject({ url: '/friends', headers: bearer(bob) })).json()
  assert.equal(friendsOfBob.friends[0].userId, lea)
  assert.equal(friendsOfBob.friends[0].onlineStatus, 'offline')
  assert.equal(friendsOfBob.friends[0].lastSeenAt, null)

  assert.deepEqual((await call('DELETE', lea, bob)).json(), { ok: true })
  assert.equal(stores.links.size, 0)
  assert.deepEqual((await app.inject({ url: '/friends', headers: bearer(lea) })).json(), {
    friends: [],
  })
})

test('the directory lists other accounts by username with their presence', async (t) => {
  const [lea, bob, zoe] = [newUserId(), newUserId(), newUserId()]
  const stores = memoryStores([profileOf(zoe, 'zoe'), profileOf(lea, 'lea'), profileOf(bob, 'bob')])
  const { app, bearer } = await buildTestApp({
    profiles: stores.profilesRepository,
    social: stores.socialRepository,
  })
  t.after(() => app.close())

  const heartbeat = await app.inject({
    method: 'POST',
    url: '/presence/heartbeat',
    headers: bearer(zoe),
  })
  assert.deepEqual(heartbeat.json(), { onlineStatus: 'online' })
  const directory = (await app.inject({ url: '/profiles', headers: bearer(lea) })).json()
  assert.deepEqual(
    directory.users.map((user: { username: string; onlineStatus: string }) => [
      user.username,
      user.onlineStatus,
    ]),
    [
      ['bob', 'offline'],
      ['zoe', 'online'],
    ]
  )

  const offline = await app.inject({
    method: 'POST',
    url: '/presence/offline',
    headers: bearer(zoe),
  })
  assert.deepEqual(offline.json(), { onlineStatus: 'offline' })
  const presence = (await app.inject(`/presence/${zoe}`)).json()
  assert.equal(presence.userId, zoe)
  assert.equal(presence.onlineStatus, 'offline')
  assert.equal(typeof presence.lastSeenAt, 'string')
  assert.deepEqual((await app.inject(`/presence/${bob}`)).json(), {
    userId: bob,
    onlineStatus: 'offline',
    lastSeenAt: null,
  })
  assert.deepEqual((await app.inject('/presence/nope')).json(), { error: 'invalid user id' })
})
