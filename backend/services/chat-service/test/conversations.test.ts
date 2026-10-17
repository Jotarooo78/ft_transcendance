/**
 * @file conversations.test.ts
 * @brief Tests des routes de conversations.
 *
 * @details Ils vérifient ce qu'un client observe : refus sans jeton valide, ouverture réservée aux
 *   amis, une seule conversation par paire (même ouverte par l'autre, même avec des majuscules),
 *   refus des corps invalides, liste triée avec les non-lus, et réponse 503 quand une dépendance est
 *   en panne.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alice, bob, buildTestApp, eve, openConversation, sendMessage } from './helpers.js'

test('every route refuses a missing or invalid token', async (t) => {
  const { app } = await buildTestApp()
  t.after(() => app.close())
  for (const headers of [{}, { authorization: 'Bearer not-a-jwt' }]) {
    for (const [method, url] of [
      ['GET', '/conversations'],
      ['POST', '/conversations'],
      ['GET', '/unread'],
      ['POST', '/ws-ticket'],
    ] as const) {
      const response = await app.inject({ method, url, headers })
      assert.equal(response.statusCode, 401)
      assert.deepEqual(response.json(), { error: 'unauthorized' })
    }
  }
})

test('opening a conversation needs friendship and always returns the same one', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer, users } = test_
  t.after(() => app.close())
  const open = (subject: string, payload: object) =>
    app.inject({ method: 'POST', url: '/conversations', headers: bearer(subject), payload })

  const created = await open(alice, { peerUserId: bob })
  assert.equal(created.statusCode, 201)
  const conversation = created.json()
  assert.equal(conversation.peerUserId, bob)
  assert.equal(conversation.lastMessage, null)
  assert.equal(conversation.unreadCount, 0)

  const replayed = await open(alice, { peerUserId: bob })
  assert.equal(replayed.statusCode, 200)
  assert.equal(replayed.json().id, conversation.id)
  const fromBob = await open(bob, { peerUserId: alice })
  assert.equal(fromBob.statusCode, 200)
  assert.equal(fromBob.json().id, conversation.id)
  assert.equal(fromBob.json().peerUserId, alice)
  const upper = await open(alice, { peerUserId: bob.toUpperCase() })
  assert.equal(upper.json().id, conversation.id)

  const self = await open(alice, { peerUserId: alice })
  assert.equal(self.statusCode, 400)
  assert.deepEqual(self.json(), { error: 'cannot_chat_with_yourself' })
  const stranger = await open(alice, { peerUserId: eve })
  assert.equal(stranger.statusCode, 403)
  assert.deepEqual(stranger.json(), { error: 'not_friends' })

  users.state.failure = true
  const down = await open(alice, { peerUserId: bob })
  assert.equal(down.statusCode, 503)
  assert.deepEqual(down.json(), { error: 'chat_unavailable' })
})

test('opening refuses malformed bodies', async (t) => {
  const { app, bearer } = await buildTestApp()
  t.after(() => app.close())
  for (const payload of [
    {},
    { peerUserId: 'nope' },
    { peerUserId: bob, extra: 1 },
    { peerUserId: 5 },
  ]) {
    const response = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: bearer(alice),
      payload,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { error: 'invalid_request' })
  }
})

test('the list shows the most recent conversation first, with last message and unread count', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer, users } = test_
  t.after(() => app.close())
  users.befriend(alice, eve)
  const withBob = await openConversation(test_, alice, bob)
  const withEve = await openConversation(test_, alice, eve)
  await sendMessage(test_, bob, withBob, 'one')
  await sendMessage(test_, bob, withBob, 'two')
  await sendMessage(test_, eve, withEve, 'hello')
  await sendMessage(test_, alice, withBob, 'mine')

  const list = await app.inject({ url: '/conversations', headers: bearer(alice) })
  assert.equal(list.statusCode, 200)
  const page = list.json()
  assert.equal(page.total, 2)
  assert.deepEqual([page.page, page.pageSize], [1, 20])
  assert.deepEqual(
    page.items.map((item: { id: string }) => item.id),
    [withBob, withEve]
  )
  assert.equal(page.items[0].lastMessage.body, 'mine')
  assert.equal(page.items[0].unreadCount, 2)
  assert.equal(page.items[1].unreadCount, 1)

  const unread = await app.inject({ url: '/unread', headers: bearer(alice) })
  assert.deepEqual(unread.json(), { total: 3 })
  const bobList = await app.inject({ url: '/conversations', headers: bearer(bob) })
  assert.equal(bobList.json().items[0].unreadCount, 1)
  const eveList = await app.inject({ url: '/conversations', headers: bearer(eve) })
  assert.equal(eveList.json().items.length, 1)
})

test('the list paginates and refuses out-of-range pages', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer, users } = test_
  t.after(() => app.close())
  users.befriend(alice, eve)
  await openConversation(test_, alice, bob)
  await openConversation(test_, alice, eve)

  const second = await app.inject({
    url: '/conversations?page=2&pageSize=1',
    headers: bearer(alice),
  })
  assert.equal(second.json().items.length, 1)
  assert.equal(second.json().total, 2)
  for (const query of ['page=0', 'pageSize=101', 'page=abc', 'other=1']) {
    const refused = await app.inject({ url: `/conversations?${query}`, headers: bearer(alice) })
    assert.equal(refused.statusCode, 400)
    assert.deepEqual(refused.json(), { error: 'invalid_request' })
  }
})

test('a database failure answers 503 without leaking details', async (t) => {
  const { app, bearer, chat } = await buildTestApp()
  t.after(() => app.close())
  chat.state.failure = true
  const response = await app.inject({ url: '/conversations', headers: bearer(alice) })
  assert.equal(response.statusCode, 503)
  assert.deepEqual(response.json(), { error: 'chat_unavailable' })
})
