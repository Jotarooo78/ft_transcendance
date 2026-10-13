import { DomainError } from '@ft/service-kit'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { createInMemoryNotesRepository } from '../src/repositories/notes.repository.js'

const userId = '11111111-1111-4111-8111-111111111111'
let app: Awaited<ReturnType<typeof buildApp>>
let authorization: string

before(async () => {
  app = await buildApp(
    { port: 0, jwtSecret: 'test-secret' },
    { notes: createInMemoryNotesRepository(), ready: async () => undefined, logger: false }
  )
  await app.ready()
  authorization = `Bearer ${app.jwt.sign({ sub: userId }, { expiresIn: '1h' })}`
})

after(() => app.close())

const post = (payload: unknown, headers = { authorization }) =>
  app.inject({ method: 'POST', url: '/notes', headers, payload: payload as object })

test('a private route refuses a request without token', async () => {
  const response = await post({ title: 'a' }, { authorization: '' })
  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.json(), { error: 'unauthorized' })
})

test('a valid note is created then read by its owner', async () => {
  const created = await post({ title: '  Hello  ' })
  assert.equal(created.statusCode, 201)
  assert.equal(created.json().title, 'Hello')

  const read = await app.inject({ url: `/notes/${created.json().id}`, headers: { authorization } })
  assert.deepEqual(read.json(), created.json())
})

test('unknown fields and wrong types are refused, never converted', async () => {
  for (const payload of [{ title: 'a', extra: 1 }, { title: 5 }, {}, { title: '' }]) {
    const response = await post(payload)
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { error: 'invalid_request' })
  }
})

test('a domain error keeps its status and public code', async () => {
  const url = '/notes/22222222-2222-4222-8222-222222222222'
  const response = await app.inject({ url, headers: { authorization } })
  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), { error: 'note_not_found' })
})

test('a domain error can carry extra public fields', async () => {
  const probe = await buildApp(
    { port: 0, jwtSecret: 'test-secret' },
    { notes: createInMemoryNotesRepository(), ready: async () => undefined, logger: false }
  )
  probe.get('/refused', async () => {
    throw new DomainError(409, 'username already registered', { code: 'USERNAME_TAKEN' })
  })
  const response = await probe.inject('/refused')
  await probe.close()
  assert.equal(response.statusCode, 409)
  assert.deepEqual(response.json(), {
    error: 'username already registered',
    code: 'USERNAME_TAKEN',
  })
})

test('ops routes answer and requests are measured by route pattern', async () => {
  assert.deepEqual((await app.inject('/health')).json(), {
    status: 'ok',
    service: 'skeleton-service',
  })
  assert.equal((await app.inject('/ready')).statusCode, 200)
  const metrics = (await app.inject('/metrics')).body
  assert.match(
    metrics,
    /http_request_duration_seconds_count\{service="skeleton-service",method="GET",route="\/notes\/:id",status_code="404"\} 1/
  )
  assert.match(metrics, /skeleton_service_process_cpu_user_seconds_total/)
})
