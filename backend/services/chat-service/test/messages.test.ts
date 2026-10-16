/**
 * @file messages.test.ts
 * @brief Tests des routes de messages.
 *
 * @details Ils vérifient les règles qui comptent : un étranger reçoit 404 (jamais 403) ; l'amitié est
 *   revérifiée à chaque envoi mais pas pour lire ; le texte est borné ; l'historique se pagine dans
 *   les deux sens ; on ne supprime que ses messages, et la suppression se rejoue ; le repère de
 *   lecture ne recule jamais.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alice, bob, buildTestApp, eve, openConversation, sendMessage } from './helpers.js'

test('sending stores the message and returns it', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer } = test_
  t.after(() => app.close())
  const id = await openConversation(test_, alice, bob)

  const sent = await sendMessage(test_, alice, id, '  Salut !  ')
  assert.equal(sent.statusCode, 201)
  assert.deepEqual(sent.json(), {
    id: 1,
    conversationId: id,
    senderUserId: alice,
    body: 'Salut !',
    createdAt: '2026-01-01T00:00:01.000Z',
    deletedAt: null,
  })
  const history = await app.inject({ url: `/conversations/${id}/messages`, headers: bearer(bob) })
  assert.equal(history.json().items[0].body, 'Salut !')
})

test('sending refuses an invalid text, an extra field and a missing body', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer } = test_
  t.after(() => app.close())
  const id = await openConversation(test_, alice, bob)

  for (const body of ['', '   ', 'a'.repeat(2001)]) {
    const response = await sendMessage(test_, alice, id, body)
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { error: 'invalid_message' })
  }
  assert.equal((await sendMessage(test_, alice, id, 'a'.repeat(2000))).statusCode, 201)
  assert.equal((await sendMessage(test_, alice, id, '😀'.repeat(2000))).statusCode, 201)
  for (const payload of [{}, { body: 'x', extra: 1 }, { body: 5 }]) {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${id}/messages`,
      headers: bearer(alice),
      payload,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { error: 'invalid_request' })
  }
})

test('a stranger gets 404, never 403, on every conversation route', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer } = test_
  t.after(() => app.close())
  const id = await openConversation(test_, alice, bob)
  await sendMessage(test_, alice, id, 'private')

  const attempts = [
    { method: 'GET', url: `/conversations/${id}/messages` },
    { method: 'POST', url: `/conversations/${id}/messages`, payload: { body: 'hi' } },
    { method: 'DELETE', url: `/conversations/${id}/messages/1` },
    { method: 'POST', url: `/conversations/${id}/read`, payload: { upToMessageId: 1 } },
  ] as const
  for (const attempt of attempts) {
    const response = await app.inject({ ...attempt, headers: bearer(eve) })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { error: 'conversation_not_found' })
  }
  const unknown = await app.inject({
    url: '/conversations/00000000-0000-4000-8000-000000000000/messages',
    headers: bearer(alice),
  })
  assert.equal(unknown.statusCode, 404)
})

test('after a break-up sending is refused but the history stays readable', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer, users } = test_
  t.after(() => app.close())
  const id = await openConversation(test_, alice, bob)
  await sendMessage(test_, alice, id, 'before')

  users.unfriend(alice, bob)
  const refused = await sendMessage(test_, bob, id, 'after')
  assert.equal(refused.statusCode, 403)
  assert.deepEqual(refused.json(), { error: 'not_friends' })
  const history = await app.inject({ url: `/conversations/${id}/messages`, headers: bearer(bob) })
  assert.equal(history.statusCode, 200)
  assert.equal(history.json().items.length, 1)

  users.befriend(alice, bob)
  users.state.failure = true
  const down = await sendMessage(test_, alice, id, 'unverified')
  assert.equal(down.statusCode, 503)
  assert.deepEqual(down.json(), { error: 'chat_unavailable' })
  users.state.failure = false
  assert.equal((await sendMessage(test_, alice, id, 'again')).statusCode, 201)
})

test('the history pages backwards with before and catches up forwards with after', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer } = test_
  t.after(() => app.close())
  const id = await openConversation(test_, alice, bob)
  for (const body of ['m1', 'm2', 'm3', 'm4', 'm5']) {
    await sendMessage(test_, alice, id, body)
  }
  const get = async (query: string) => {
    const response = await app.inject({
      url: `/conversations/${id}/messages?${query}`,
      headers: bearer(bob),
    })
    return { status: response.statusCode, ...response.json() }
  }
  const ids = (page: { items: { id: number }[] }) => page.items.map((item) => item.id)

  const latest = await get('limit=2')
  assert.deepEqual(ids(latest), [5, 4])
  assert.equal(latest.hasMore, true)
  const older = await get('limit=2&before=4')
  assert.deepEqual(ids(older), [3, 2])
  const oldest = await get('before=2')
  assert.deepEqual(ids(oldest), [1])
  assert.equal(oldest.hasMore, false)
  const catchUp = await get('after=2')
  assert.deepEqual(ids(catchUp), [3, 4, 5])
  assert.equal(catchUp.hasMore, false)
  const everything = await get('after=0')
  assert.deepEqual(ids(everything), [1, 2, 3, 4, 5])

  for (const query of [
    'before=3&after=1',
    'limit=101',
    'limit=0',
    'before=0',
    'before=abc',
    'after=-1',
    'x=1',
  ]) {
    const refused = await get(query)
    assert.equal(refused.status, 400)
    assert.deepEqual(refused, { status: 400, error: 'invalid_request' })
  }
})

test('deleting hides the text, only works on your own messages and can be replayed', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer } = test_
  t.after(() => app.close())
  const id = await openConversation(test_, alice, bob)
  await sendMessage(test_, alice, id, 'oops')
  const remove = (subject: string, messageId: number) =>
    app.inject({
      method: 'DELETE',
      url: `/conversations/${id}/messages/${messageId}`,
      headers: bearer(subject),
    })

  const other = await remove(bob, 1)
  assert.equal(other.statusCode, 404)
  assert.deepEqual(other.json(), { error: 'message_not_found' })
  const missing = await remove(alice, 99)
  assert.equal(missing.statusCode, 404)

  const first = await remove(alice, 1)
  assert.equal(first.statusCode, 200)
  assert.equal(first.json().body, null)
  assert.notEqual(first.json().deletedAt, null)
  assert.equal((await remove(alice, 1)).statusCode, 200)
  const history = await app.inject({ url: `/conversations/${id}/messages`, headers: bearer(bob) })
  assert.equal(history.json().items[0].body, null)
})

test('read marks only move forward and are validated against the conversation', async (t) => {
  const test_ = await buildTestApp()
  const { app, bearer, users } = test_
  t.after(() => app.close())
  users.befriend(alice, eve)
  const id = await openConversation(test_, alice, bob)
  const other = await openConversation(test_, alice, eve)
  for (const body of ['a', 'b', 'c']) {
    await sendMessage(test_, alice, id, body)
  }
  await sendMessage(test_, eve, other, 'elsewhere')
  const read = (conversationId: string, upToMessageId: number, subject = bob) =>
    app.inject({
      method: 'POST',
      url: `/conversations/${conversationId}/read`,
      headers: bearer(subject),
      payload: { upToMessageId },
    })
  const unread = async () =>
    (await app.inject({ url: '/unread', headers: bearer(bob) })).json().total

  assert.equal(await unread(), 3)
  assert.deepEqual((await read(id, 2)).json(), { lastReadMessageId: 2 })
  assert.equal(await unread(), 1)
  assert.deepEqual((await read(id, 1)).json(), { lastReadMessageId: 2 })
  assert.equal(await unread(), 1)
  assert.deepEqual((await read(id, 3)).json(), { lastReadMessageId: 3 })
  assert.equal(await unread(), 0)

  const foreign = await read(id, 4)
  assert.equal(foreign.statusCode, 400)
  assert.deepEqual(foreign.json(), { error: 'invalid_request' })
  assert.equal((await read(id, 99)).statusCode, 400)
  const invalid = await app.inject({
    method: 'POST',
    url: `/conversations/${id}/read`,
    headers: bearer(bob),
    payload: { upToMessageId: 0 },
  })
  assert.equal(invalid.statusCode, 400)
})
