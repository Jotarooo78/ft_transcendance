/**
 * @file internal.test.ts
 * @brief Tests de la route par laquelle auth-service demande la création d'un profil.
 *
 * @details Ils vérifient le refus sans le secret partagé, le refus d'une demande mal formée, et
 *   qu'une demande renvoyée deux fois ne crée qu'un seul profil.
 */

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { profileConflict, usernameTaken } from '../src/domain/errors.js'
import type { ProfileProvisionCommand } from '../src/domain/provision.js'
import { buildTestApp, internalHeaders, memoryStores, newUserId, profileOf } from './helpers.js'

/** @brief Fabrique une demande de création de profil valide pour un compte donné. */
const commandFor = (userId: string, username = 'lea') => ({
  eventId: randomUUID(),
  type: 'ProfileProvisionRequested.v1',
  schemaVersion: 1,
  aggregateId: userId,
  aggregateVersion: 1,
  occurredAt: '2026-01-01T00:00:00.000Z',
  data: { displayName: 'Léa', username },
})

/**
 * @brief Crée un faux repository de création de profil gardé en mémoire.
 * @returns Le faux repository et la liste des demandes reçues.
 */
function memoryProvisioning() {
  const processed = new Set<string>()
  const usernames = new Map<string, string>()
  const received: ProfileProvisionCommand[] = []
  return {
    received,
    provision: async (command: ProfileProvisionCommand) => {
      received.push(command)
      if (processed.has(command.eventId)) {
        return { status: 'already_processed' as const }
      }
      if (usernames.has(command.aggregateId)) {
        throw profileConflict()
      }
      if ([...usernames.values()].includes(command.data.username)) {
        throw usernameTaken()
      }
      processed.add(command.eventId)
      usernames.set(command.aggregateId, command.data.username)
      return { status: 'created' as const }
    },
  }
}

test('PUT /internal/profiles creates a profile, replays idempotently and normalizes the username', async (t) => {
  const provisioning = memoryProvisioning()
  const { app } = await buildTestApp({ provisioning })
  t.after(() => app.close())
  const userId = newUserId()
  const command = commandFor(userId, ' LEA_2 ')
  const put = (
    payload: object,
    target = userId,
    headers: Record<string, string> = internalHeaders
  ) => app.inject({ method: 'PUT', url: `/internal/profiles/${target}`, headers, payload })

  const created = await put(command)
  assert.equal(created.statusCode, 201)
  assert.deepEqual(created.json(), { status: 'created', userId })
  assert.equal(provisioning.received[0]?.data.username, 'lea_2')
  const replayed = await put(command)
  assert.equal(replayed.statusCode, 200)
  assert.deepEqual(replayed.json(), { status: 'already_processed', userId })

  const conflict = await put(commandFor(userId, 'other'))
  assert.equal(conflict.statusCode, 409)
  assert.deepEqual(conflict.json(), {
    error: 'profile already exists for another command',
    code: 'PROFILE_CONFLICT',
  })
  const other = newUserId()
  const taken = await put(commandFor(other, 'lea_2'), other)
  assert.equal(taken.statusCode, 409)
  assert.deepEqual(taken.json(), { error: 'username already registered', code: 'USERNAME_TAKEN' })
})

test('PUT /internal/profiles requires the service credential and a well-formed command', async (t) => {
  const provisioning = memoryProvisioning()
  const { app, bearer } = await buildTestApp({ provisioning })
  t.after(() => app.close())
  const userId = newUserId()
  const valid = commandFor(userId)
  const put = (payload: object, headers: Record<string, string>, target = userId) =>
    app.inject({ method: 'PUT', url: `/internal/profiles/${target}`, headers, payload })

  for (const headers of [{}, { authorization: 'Bearer wrong' }, bearer(userId)]) {
    const response = await put(valid, headers)
    assert.equal(response.statusCode, 401)
    assert.deepEqual(response.json(), { error: 'unauthorized' })
  }

  const malformed = [
    {},
    { ...valid, eventId: 'nope' },
    { ...valid, type: 'Other.v1' },
    { ...valid, schemaVersion: 2 },
    { ...valid, aggregateId: newUserId() },
    { ...valid, aggregateVersion: 0 },
    { ...valid, occurredAt: 'yesterday' },
    { ...valid, data: { ...valid.data, displayName: ' padded ' } },
    { ...valid, data: { ...valid.data, displayName: 'a'.repeat(61) } },
    { ...valid, data: { ...valid.data, username: 'no' } },
    { ...valid, data: null },
  ]
  for (const payload of malformed) {
    const response = await put(payload, internalHeaders)
    assert.equal(response.statusCode, 400, JSON.stringify(payload))
    assert.deepEqual(response.json(), { error: 'invalid profile provision command' })
  }
  assert.equal(provisioning.received.length, 0)
})

test('GET /internal/friendships tells chat-service whether two accounts are friends', async (t) => {
  const [alice, bob, eve] = [newUserId(), newUserId(), newUserId()]
  const stores = memoryStores([
    profileOf(alice, 'alice'),
    profileOf(bob, 'bob'),
    profileOf(eve, 'eve'),
  ])
  await stores.socialRepository.link(alice, bob)
  const { app, bearer } = await buildTestApp({
    profiles: stores.profilesRepository,
    social: stores.socialRepository,
  })
  t.after(() => app.close())
  const get = (first: string, second: string, headers: Record<string, string> = internalHeaders) =>
    app.inject({ url: `/internal/friendships/${first}/${second}`, headers })

  for (const headers of [{}, { authorization: 'Bearer wrong' }, bearer(alice)]) {
    const refused = await get(alice, bob, headers)
    assert.equal(refused.statusCode, 401)
    assert.deepEqual(refused.json(), { error: 'unauthorized' })
  }

  assert.deepEqual((await get(alice, bob)).json(), { areFriends: true })
  assert.deepEqual((await get(bob, alice)).json(), { areFriends: true })
  assert.deepEqual((await get(alice.toUpperCase(), bob)).json(), { areFriends: true })
  assert.deepEqual((await get(alice, eve)).json(), { areFriends: false })
  assert.deepEqual((await get(alice, alice)).json(), { areFriends: false })

  const malformed = await get('not-a-uuid', bob)
  assert.equal(malformed.statusCode, 400)
  assert.deepEqual(malformed.json(), { error: 'invalid user id' })
})
