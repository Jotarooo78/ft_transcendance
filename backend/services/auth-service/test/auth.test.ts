/**
 * @file auth.test.ts
 * @brief Tests de l'inscription, de la connexion, de l'envoi des demandes de profil et de la
 *   limitation des requêtes.
 *
 * @details Ils vérifient notamment qu'une panne de user-service laisse l'inscription « en attente »
 *   puis qu'un nouvel essai la termine, qu'un username déjà pris bloque définitivement le compte,
 *   et qu'un mot de passe faux et un email inconnu donnent la même réponse.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeUsername } from '../src/domain/credentials.js'
import {
  nextAttemptAt,
  PermanentProvisionError,
  type ProfileProvision,
} from '../src/domain/registration.js'
import { createProfileDeliveryService } from '../src/services/profile-delivery.service.js'
import { buildTestApp, memoryStore, validSignup } from './helpers.js'

/** @brief Email et mot de passe du compte d'exemple. */
const credentials = { email: 'lea@example.com', password: validSignup.password }

test('username normalization implements the canonical contract', () => {
  assert.equal(normalizeUsername(' Alice '), 'alice')
  assert.equal(normalizeUsername('ALICE_2'), 'alice_2')
  assert.equal(normalizeUsername('ab'), null)
  assert.equal(normalizeUsername('alice-2'), null)
  assert.equal(normalizeUsername(null), null)
})

test('signup activates the account only after Users confirms the canonical profile', async (t) => {
  const delivered: ProfileProvision[] = []
  const users = {
    provisionProfile: async (provision: ProfileProvision) => {
      delivered.push(provision)
    },
  }
  const { app, post, store } = await buildTestApp({ users })
  t.after(() => app.close())

  const signup = await post('/signup', validSignup)
  assert.equal(signup.statusCode, 201)
  const { userId } = signup.json()
  assert.deepEqual(signup.json(), { status: 'registered', userId, nextAction: 'login' })
  assert.equal(delivered.length, 1)
  assert.deepEqual(
    {
      userId: delivered[0]?.userId,
      username: delivered[0]?.username,
      displayName: delivered[0]?.displayName,
    },
    { userId, username: 'lea_2', displayName: 'Léa' }
  )
  const account = store.accounts.get('lea@example.com')
  assert.equal(account?.state, 'active')
  assert.equal(account?.passwordHash, `hashed:${validSignup.password}`)

  const login = await post('/login', { email: ' LEA@example.com ', password: validSignup.password })
  assert.equal(login.statusCode, 200)
  const { token } = login.json()
  const claims = app.jwt.verify<{ sub: string; email: string; exp: number; iat: number }>(token)
  assert.deepEqual(
    { sub: claims.sub, email: claims.email },
    { sub: userId, email: 'lea@example.com' }
  )
  assert.equal(claims.exp - claims.iat, 3600)

  const verified = await post('/verify', undefined, { authorization: `Bearer ${token}` })
  assert.equal(verified.statusCode, 200)
  assert.equal(verified.json().valid, true)
  assert.equal(verified.json().user.sub, userId)
  const refused = await post('/verify', undefined, { authorization: 'Bearer nope' })
  assert.equal(refused.statusCode, 401)
  assert.deepEqual(refused.json(), { valid: false })

  const duplicate = await post('/signup', { ...validSignup, username: 'another' })
  assert.equal(duplicate.statusCode, 409)
  assert.deepEqual(duplicate.json(), {
    error: 'email already registered',
    code: 'ACCOUNT_ALREADY_EXISTS',
  })
})

test('login refuses unknown accounts and wrong passwords with the same answer', async (t) => {
  const { app, post } = await buildTestApp()
  t.after(() => app.close())
  await post('/signup', validSignup)

  for (const payload of [
    { ...credentials, password: 'deliberately-wrong-password' },
    { email: 'nobody@example.com', password: credentials.password },
  ]) {
    const response = await post('/login', payload)
    assert.equal(response.statusCode, 401)
    assert.deepEqual(response.json(), { error: 'invalid credentials' })
  }
  for (const payload of [
    {},
    { email: 'lea@example.com' },
    { password: 'x' },
    { email: 42, password: 'x' },
    [],
  ]) {
    const response = await post('/login', payload)
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { error: 'email and password required' })
  }
})

test('a transient Users failure returns pending, blocks login, then converges on replay', async (t) => {
  let available = false
  let calls = 0
  const users = {
    provisionProfile: async () => {
      calls++
      if (!available) {
        throw new Error('user-service returned HTTP 503')
      }
    },
  }
  const { app, post, store } = await buildTestApp({ users })
  t.after(() => app.close())
  const pending = { status: 'pending', code: 'REGISTRATION_PENDING', retryAfterSeconds: 3 }

  const signup = await post('/signup', validSignup)
  assert.equal(signup.statusCode, 202)
  assert.deepEqual(signup.json(), { ...pending, nextAction: 'login' })
  assert.equal(store.accounts.get('lea@example.com')?.state, 'pending_profile')
  const blocked = await post('/login', credentials)
  assert.equal(blocked.statusCode, 202)
  assert.deepEqual(blocked.json(), pending)

  const delivery = createProfileDeliveryService(store.outboxRepository, users)
  assert.equal((await delivery.deliverDue(20)).length, 1)
  available = true
  assert.deepEqual(await delivery.deliverDue(20), [])
  assert.equal(calls, 3)
  assert.equal(store.accounts.get('lea@example.com')?.state, 'active')
  assert.equal((await post('/login', credentials)).statusCode, 200)
  assert.deepEqual(await delivery.deliverDue(20), [])
  assert.equal(calls, 3)
})

test('a permanent Users refusal is reported and leaves no usable account', async (t) => {
  for (const [code, error] of [
    ['USERNAME_TAKEN', 'username already registered'],
    ['PROFILE_CONFLICT', 'profile conflicts with an existing registration'],
  ] as const) {
    const store = memoryStore()
    const users = {
      provisionProfile: async () => {
        throw new PermanentProvisionError(code)
      },
    }
    const { app, post } = await buildTestApp({ users, store })
    t.after(() => app.close())

    const signup = await post('/signup', validSignup)
    assert.equal(signup.statusCode, 409)
    assert.deepEqual(signup.json(), { error, code })
    assert.equal(store.accounts.get('lea@example.com')?.state, 'profile_failed')
    assert.equal([...store.outbox.values()][0]?.status, 'failed')
    const login = await post('/login', credentials)
    assert.equal(login.statusCode, 409)
    assert.deepEqual(login.json(), {
      error: 'profile provisioning failed',
      code: 'REGISTRATION_FAILED',
    })
  }
})

test('signup validates every field before hashing or writing', async (t) => {
  let hashes = 0
  const { app, post, store } = await buildTestApp({
    hashPassword: async (password) => {
      hashes++
      return `hashed:${password}`
    },
  })
  t.after(() => app.close())
  const refused = [
    {},
    [],
    { ...validSignup, email: 'not-an-email' },
    { ...validSignup, email: `${'a'.repeat(250)}@x.io` },
    { ...validSignup, password: 'short' },
    { ...validSignup, password: 'p'.repeat(129) },
    { ...validSignup, username: 'ab' },
    { ...validSignup, username: 'lea-2' },
    { ...validSignup, displayName: '   ' },
    { ...validSignup, displayName: 'a'.repeat(61) },
    { ...validSignup, displayName: 42 },
  ]
  for (const payload of refused) {
    const response = await post('/signup', payload)
    assert.equal(response.statusCode, 400, JSON.stringify(payload))
    assert.deepEqual(response.json(), {
      error: 'valid email, password (8-128 chars), username and displayName required',
    })
  }
  assert.equal(hashes, 0)
  assert.equal(store.accounts.size, 0)
})

test('configured limits apply per minute to signup and login only', async (t) => {
  const { app, post } = await buildTestApp({
    rateLimits: { signupPerMinute: 10, loginPerMinute: 20 },
  })
  t.after(() => app.close())

  const statusesOf = async (url: string, count: number) => {
    const statuses: number[] = []
    for (let attempt = 0; attempt < count; attempt++) {
      statuses.push((await post(url, {})).statusCode)
    }
    return statuses
  }

  assert.deepEqual(await statusesOf('/login', 21), [...Array(20).fill(400), 429])
  assert.deepEqual((await post('/login', {})).json(), { error: 'too_many_requests' })
  assert.deepEqual(await statusesOf('/signup', 11), [...Array(10).fill(400), 429])

  for (let attempt = 0; attempt < 25; attempt++) {
    assert.equal((await app.inject('/health')).statusCode, 200)
  }
  const unlimited = await buildTestApp()
  t.after(() => unlimited.app.close())
  for (let attempt = 0; attempt < 25; attempt++) {
    assert.equal((await unlimited.post('/login', {})).statusCode, 400)
  }
})

test('readiness, metrics, unexpected failures and retry delays', async (t) => {
  const store = memoryStore()
  const accounts = {
    ...store.accountsRepository,
    findByEmail: async () => {
      throw new Error('private database detail')
    },
  }
  const { app, post } = await buildTestApp({
    accounts,
    ready: () => Promise.reject(new Error('db down')),
  })
  t.after(() => app.close())

  const failure = await post('/login', credentials)
  assert.equal(failure.statusCode, 500)
  assert.deepEqual(failure.json(), { error: 'internal server error' })
  const ready = await app.inject('/ready')
  assert.equal(ready.statusCode, 503)
  assert.deepEqual(ready.json(), { status: 'not-ready', service: 'auth-service' })
  assert.match((await app.inject('/metrics')).body, /auth_service_/)

  const delays = [1, 2, 6, 7, 30].map((attempts) => nextAttemptAt(attempts, 0).getTime() / 1000)
  assert.deepEqual(delays, [2, 4, 60, 60, 60])
})
