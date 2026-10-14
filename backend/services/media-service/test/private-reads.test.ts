/**
 * @file private-reads.test.ts
 * @brief Tests des lectures réservées au propriétaire : liste de ses fichiers et aperçu.
 *
 * @details Ils vérifient le refus sans jeton valide et qu'un compte ne peut ni voir ni lire les
 *   fichiers d'un autre.
 */

import jwt from '@fastify/jwt'
import Fastify from 'fastify'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { StoredFile, StoredFileWithVariants } from '../src/domain/file.js'
import { createAssetsRepository } from '../src/repositories/assets.repository.js'
import { buildTestApp, fakeAssets, fileId, other, owner } from './helpers.js'

/** @brief Type du faux objet de base de données donné au repository. */
type FakeDatabase = Parameters<typeof createAssetsRepository>[0]

test('Media requires a configured secret', async () => {
  for (const secret of ['', '   ']) {
    await assert.rejects(buildTestApp({ secret }), /JWT_SECRET/)
  }
})

test('invalid tokens are refused before any database read', async (t) => {
  let reads = 0
  const list = async () => {
    reads++
    return { items: [], total: 0 }
  }
  const { app } = await buildTestApp({ assets: fakeAssets({ list }) })
  const otherIssuer = Fastify()
  otherIssuer.register(jwt, { secret: 'different-test-secret' })
  await otherIssuer.ready()
  t.after(async () => {
    await app.close()
    await otherIssuer.close()
  })

  const inOneHour = Math.floor(Date.now() / 1000) + 3600
  const sign = (payload: Record<string, unknown>) => app.jwt.sign({ exp: inOneHour, ...payload })
  const valid = sign({ sub: owner.toUpperCase() })
  const [header, payload, signature] = valid.split('.')
  assert.ok(header && payload && signature)
  const forged = { ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: other }
  const tampered = `${header}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${signature}`
  const refused = [
    undefined,
    '',
    'not-a-jwt',
    tampered,
    otherIssuer.jwt.sign({ sub: owner }, { expiresIn: '1h' }),
    sign({ sub: owner, exp: Math.floor(Date.now() / 1000) - 60 }),
    app.jwt.sign({ sub: owner }),
    sign({ sub: owner, nbf: inOneHour }),
    ...[undefined, null, 42, {}, [], '', 'not-a-uuid'].map((sub) => sign({ sub })),
  ]
  for (const token of refused) {
    const headers: Record<string, string> =
      token === undefined ? {} : { authorization: `Bearer ${token}` }
    const response = await app.inject({ url: '/assets', headers })
    assert.equal(response.statusCode, 401)
    assert.deepEqual(response.json(), { error: 'unauthorized' })
    assert.equal(response.headers['cache-control'], 'no-store')
  }
  assert.equal(reads, 0)

  const accepted = await app.inject({
    url: '/assets',
    headers: { authorization: `Bearer ${valid}` },
  })
  assert.equal(accepted.statusCode, 200)
  assert.equal(reads, 1)
})

test('owned reads filter on both identifier and owner, and fail closed on malformed input', async () => {
  const idA = 'aaaaaaaa-0000-4000-8000-000000000003'
  const idB = 'bbbbbbbb-0000-4000-8000-000000000004'
  const rows = [
    { id: idA, uploaderUserId: owner },
    { id: idB, uploaderUserId: other },
    { id: fileId, uploaderUserId: null },
  ]
  const predicates: { id: string; uploaderUserId: string }[] = []
  const database = {
    asset: {
      findFirst: async ({ where }: { where: { id: string; uploaderUserId: string } }) => {
        predicates.push(where)
        const match = (row: (typeof rows)[number]) =>
          row.id === where.id && row.uploaderUserId === where.uploaderUserId
        return rows.find(match) ?? null
      },
    },
  } as unknown as FakeDatabase
  const assets = createAssetsRepository(database)

  assert.equal((await assets.findOwned(owner.toUpperCase(), idA.toUpperCase()))?.id, idA)
  assert.deepEqual(predicates.at(-1), { id: idA, uploaderUserId: owner })
  for (const id of [idB, fileId, 'dddddddd-0000-4000-8000-000000000006']) {
    assert.equal(await assets.findOwned(owner, id), null)
    assert.deepEqual(predicates.at(-1), { id, uploaderUserId: owner })
  }

  const before = predicates.length
  assert.equal(await assets.findOwned('bad', idA), null)
  assert.equal(await assets.findOwned('', idA), null)
  assert.equal(await assets.findOwned(owner, 'bad'), null)
  assert.equal(predicates.length, before)

  const failing = {
    asset: {
      findFirst: async () => {
        throw new Error('database unavailable')
      },
    },
  } as unknown as FakeDatabase
  await assert.rejects(
    createAssetsRepository(failing).findOwned(owner, idA),
    /database unavailable/
  )
})

test('the private list queries owner and state, pages deterministically and exposes no path', async (t) => {
  const calls: unknown[] = []
  const asset: StoredFile = {
    id: fileId,
    uploaderUserId: owner,
    purpose: 'audio',
    state: 'ready',
    storageKey: 'secret.original',
    mimeType: 'audio/flac',
    byteSize: 42n,
    durationMs: 6000n,
    checksumSha256: 'private-hash',
  }
  const database = {
    asset: {
      findMany: async (options: unknown) => {
        calls.push(options)
        return [asset]
      },
      count: async (options: unknown) => {
        calls.push(options)
        return 2
      },
    },
  } as unknown as FakeDatabase
  const { app, bearer } = await buildTestApp({ assets: createAssetsRepository(database) })
  t.after(() => app.close())

  assert.equal((await app.inject('/assets')).statusCode, 401)
  assert.equal(calls.length, 0)

  const headers = bearer(owner)
  const page = await app.inject({ url: '/assets?page=2&pageSize=1', headers })
  assert.equal(page.statusCode, 200)
  assert.deepEqual(page.json(), {
    items: [
      {
        id: fileId,
        usage: 'audio',
        state: 'ready',
        mimeType: 'audio/flac',
        byteSize: 42,
        durationMs: 6000,
      },
    ],
    total: 2,
    page: 2,
    pageSize: 1,
  })
  assert.deepEqual(calls[0], {
    where: { uploaderUserId: owner, state: 'ready', purpose: { in: ['audio', 'cover'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    skip: 1,
  })
  const defaults = await app.inject({ url: '/assets', headers })
  assert.equal(defaults.json().pageSize, 50)

  const refused = [
    'page=0',
    'pageSize=101',
    'page=1&page=2',
    'page=10000',
    'uploaderUserId=other',
    'pageSize=1.5',
  ]
  for (const query of refused) {
    const response = await app.inject({ url: `/assets?${query}`, headers })
    assert.equal(response.statusCode, 400, query)
    assert.deepEqual(response.json(), { error: 'invalid_request', message: 'Pagination invalide.' })
  }
})

test('owner-only GET/HEAD serves exact image or MP3 preview bytes with uniform refusals', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'private-reads-'))
  const bytes = Buffer.from('validated-fixture-bytes')
  await writeFile(join(directory, 'preview.mp3'), bytes)
  await writeFile(join(directory, 'image.png'), bytes)
  await symlink(join(directory, 'preview.mp3'), join(directory, 'link'))
  await mkdir(join(directory, 'directory'))
  const preview = {
    storageKey: 'preview.mp3',
    mimeType: 'audio/mpeg',
    byteSize: BigInt(bytes.length),
  }
  const original: StoredFileWithVariants = {
    id: fileId,
    uploaderUserId: owner,
    purpose: 'audio',
    state: 'ready',
    storageKey: 'original.flac',
    mimeType: 'audio/flac',
    byteSize: 500n,
    durationMs: 6000n,
    checksumSha256: 'hash',
    variants: [preview],
  }
  const state = { asset: { ...original }, fail: false }
  const findOwned = async (subject: string, id: string) => {
    if (state.fail) {
      throw new Error('SQL failure')
    }
    return subject === state.asset.uploaderUserId && id === state.asset.id ? state.asset : null
  }
  const { app, bearer } = await buildTestApp({
    storageDir: directory,
    assets: fakeAssets({ findOwned }),
  })
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true })
  })
  const headers = bearer(owner)
  const url = `/assets/${fileId}/private-content`

  for (const method of ['GET', 'HEAD'] as const) {
    const response = await app.inject({ method, url, headers })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'audio/mpeg')
    assert.equal(response.headers['content-length'], String(bytes.length))
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    assert.deepEqual(response.rawPayload, method === 'GET' ? bytes : Buffer.alloc(0))

    assert.equal((await app.inject({ method, url, headers: bearer(other) })).statusCode, 404)
    const unauthenticated = await app.inject({ method, url })
    assert.equal(unauthenticated.statusCode, 401)
    const malformed = await app.inject({ method, url: '/assets/bad/private-content', headers })
    assert.equal(malformed.statusCode, 400)
    if (method === 'HEAD') {
      assert.equal(unauthenticated.rawPayload.length, 0)
      assert.equal(malformed.rawPayload.length, 0)
    }
  }

  const refused: Partial<StoredFileWithVariants>[] = [
    { state: 'pending' },
    { state: 'deleted' },
    { state: 'deleting' },
    { uploaderUserId: null },
    { variants: [] },
    ...['missing', 'link', 'directory', '../preview.mp3'].map((storageKey) => ({
      variants: [{ ...preview, storageKey }],
    })),
    { variants: [{ ...preview, byteSize: 1n }] },
  ]
  for (const change of refused) {
    state.asset = { ...original, ...change }
    const response = await app.inject({ url, headers })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { error: 'file_not_found', message: 'Aperçu indisponible.' })
  }

  state.asset = {
    ...original,
    purpose: 'cover',
    storageKey: 'image.png',
    mimeType: 'image/png',
    byteSize: BigInt(bytes.length),
  }
  const image = await app.inject({ url, headers })
  assert.equal(image.statusCode, 200)
  assert.deepEqual(image.rawPayload, bytes)
  assert.equal(image.headers['content-type'], 'image/png')

  state.fail = true
  const outage = await app.inject({ url, headers })
  assert.equal(outage.statusCode, 503)
  assert.equal(outage.json().error, 'files_unavailable')
})

test('the service has no private read route by bare identifier', async (t) => {
  const { app } = await buildTestApp()
  t.after(() => app.close())
  assert.equal((await app.inject(`/assets/${fileId}`)).statusCode, 404)
})
