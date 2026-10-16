/**
 * @file realtime.test.ts
 * @brief Tests du temps réel : tickets, WebSocket, événements poussés aux comptes concernés.
 *
 * @details `app.injectWS` ouvre une connexion WebSocket en mémoire, sans réseau. Les tests vérifient
 *   que le ticket est à usage unique et expire, que les deux amis reçoivent les événements et un
 *   étranger rien, et qu'une panne de la diffusion ne fait jamais échouer un envoi.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WebSocket } from 'ws'
import { createHub } from '../src/realtime/hub.js'
import {
  alice,
  bob,
  buildTestApp,
  eve,
  openConversation,
  sendMessage,
  type TestApp,
} from './helpers.js'

/** @brief Demande un ticket au nom d'un compte. */
async function ticketFor({ app, bearer }: TestApp, subject: string): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/ws-ticket', headers: bearer(subject) })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().expiresInSeconds, 30)
  return response.json().ticket
}

/** @brief Ouvre un WebSocket au nom d'un compte et range tout ce qu'il reçoit dans `received`. */
async function connect(test: TestApp, subject: string) {
  const socket: WebSocket = await test.app.injectWS(`/ws?ticket=${await ticketFor(test, subject)}`)
  test.sockets.push(socket)
  const received: Record<string, unknown>[] = []
  socket.on('message', (data) => received.push(JSON.parse(data.toString())))
  return { socket, received }
}

/** @brief Laisse aux événements en cours le temps d'arriver. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

test('a ticket is single-use, expires after 30 seconds and is required', async (t) => {
  const test = await buildTestApp()
  t.after(() => test.close())

  const ticket = await ticketFor(test, alice)
  const first = await test.app.injectWS(`/ws?ticket=${ticket}`)
  test.sockets.push(first)
  await assert.rejects(test.app.injectWS(`/ws?ticket=${ticket}`), /401/)
  await assert.rejects(test.app.injectWS('/ws?ticket=forged'), /401/)
  await assert.rejects(test.app.injectWS('/ws'), /400/)

  const stale = await ticketFor(test, alice)
  test.clock.now += 31_000
  await assert.rejects(test.app.injectWS(`/ws?ticket=${stale}`), /401/)
})

test('both friends receive a new message, a stranger receives nothing', async (t) => {
  const test = await buildTestApp()
  t.after(() => test.close())
  const id = await openConversation(test, alice, bob)
  const [forAlice, forBob, forEve] = [
    await connect(test, alice),
    await connect(test, bob),
    await connect(test, eve),
  ]

  const sent = await sendMessage(test, alice, id, 'live')
  await settle()
  const expected = { type: 'message.created', conversationId: id, message: sent.json() }
  assert.deepEqual(forAlice.received, [expected])
  assert.deepEqual(forBob.received, [expected])
  assert.deepEqual(forEve.received, [])
})

test('a deletion reaches both friends and a read mark only the other one', async (t) => {
  const test = await buildTestApp()
  t.after(() => test.close())
  const id = await openConversation(test, alice, bob)
  await sendMessage(test, alice, id, 'one')
  const [forAlice, forBob] = [await connect(test, alice), await connect(test, bob)]

  await test.app.inject({
    method: 'POST',
    url: `/conversations/${id}/read`,
    headers: test.bearer(bob),
    payload: { upToMessageId: 1 },
  })
  await test.app.inject({
    method: 'DELETE',
    url: `/conversations/${id}/messages/1`,
    headers: test.bearer(alice),
  })
  await settle()

  assert.deepEqual(forAlice.received, [
    { type: 'conversation.read', conversationId: id, byUserId: bob, lastReadMessageId: 1 },
    { type: 'message.deleted', conversationId: id, messageId: 1 },
  ])
  assert.deepEqual(forBob.received, [{ type: 'message.deleted', conversationId: id, messageId: 1 }])
})

test('every tab of an account receives the event', async (t) => {
  const test = await buildTestApp()
  t.after(() => test.close())
  const id = await openConversation(test, alice, bob)
  const tabs = []
  for (let index = 0; index < 5; index++) {
    tabs.push(await connect(test, bob))
  }

  await sendMessage(test, alice, id, 'broadcast')
  await settle()
  assert.deepEqual(
    tabs.map((tab) => tab.received.length),
    [1, 1, 1, 1, 1]
  )
})

test('a failing broadcast never fails the send', async (t) => {
  const hub = createHub()
  const broken = { ...hub, publish: () => undefined }
  const test = await buildTestApp({ hub: broken })
  t.after(async () => {
    await test.close()
    hub.closeAll()
  })
  const id = await openConversation(test, alice, bob)
  const sent = await sendMessage(test, alice, id, 'stored anyway')
  assert.equal(sent.statusCode, 201)
})

/**
 * @brief Fabrique une fausse connexion qui note ce qu'on lui fait, sans réseau.
 * @param send Comportement de l'envoi ; par défaut, il réussit.
 * @returns La fausse connexion et le journal de ce qu'elle a reçu comme ordres.
 */
function fakeSocket(send: () => void = () => undefined) {
  const calls: string[] = []
  const socket = {
    on: () => socket,
    ping: () => undefined,
    send,
    close: (code?: number) => calls.push(`close ${code}`),
    terminate: () => calls.push('terminate'),
  } as unknown as WebSocket
  return { socket, calls }
}

test('the hub refuses a sixth connection for the same account', () => {
  const hub = createHub()
  const tabs = Array.from({ length: 6 }, () => fakeSocket())
  const accepted = tabs.map((tab) => hub.register(alice, tab.socket))
  assert.deepEqual(accepted, [true, true, true, true, true, false])
  assert.deepEqual(tabs[5]?.calls, ['close 1008'])
  assert.deepEqual(tabs[0]?.calls, [])
  hub.closeAll()
})

test('the hub drops a socket whose send throws instead of failing', () => {
  const hub = createHub()
  const broken = fakeSocket(() => {
    throw new Error('broken pipe')
  })
  hub.register(alice, broken.socket)
  const event = { type: 'message.deleted', conversationId: 'c', messageId: 1 } as const
  assert.doesNotThrow(() => hub.publish([alice], event))
  assert.deepEqual(broken.calls, ['terminate'])
  hub.closeAll()
})
