/**
 * @file avatars.test.ts
 * @brief Tests des avatars : envoi d'une image, cas de refus et lecture.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { maxAvatarBytes } from '../src/domain/avatar.js'
import { buildTestApp, memoryAvatars, memoryStores, newUserId, profileOf } from './helpers.js'

/** @brief Premiers octets d'un fichier PNG, suffisants pour qu'il soit reconnu. */
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
/** @brief Premiers octets d'un fichier JPEG. */
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
/** @brief Premiers octets d'un fichier WebP. */
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.from([1]),
])

/**
 * @brief Fabrique à la main une requête de formulaire contenant un seul fichier.
 * @param bytes Contenu du fichier.
 * @param mime Type d'image annoncé.
 * @param field Nom du champ du formulaire.
 * @returns Les en-têtes et le corps de la requête.
 */
function multipart(bytes: Buffer, mime: string, field = 'avatar') {
  const head = `--fixture\r\nContent-Disposition: form-data; name="${field}"; filename="a"\r\nContent-Type: ${mime}\r\n\r\n`
  return {
    headers: { 'content-type': 'multipart/form-data; boundary=fixture' },
    payload: Buffer.concat([Buffer.from(head), bytes, Buffer.from('\r\n--fixture--\r\n')]),
  }
}

/**
 * @brief Prépare un serveur de test, un compte et une fonction qui envoie un avatar pour ce compte.
 */
async function setup() {
  const userId = newUserId()
  const stores = memoryStores([profileOf(userId, 'lea')])
  const avatars = memoryAvatars()
  const { app, bearer } = await buildTestApp({
    profiles: stores.profilesRepository,
    avatars: avatars.storage,
  })
  const upload = (bytes: Buffer, mime: string, field?: string, subject: unknown = userId) => {
    const form = multipart(bytes, mime, field)
    return app.inject({
      method: 'POST',
      url: '/me/avatar',
      headers: { ...form.headers, ...bearer(subject) },
      payload: form.payload,
    })
  }
  return { app, bearer, userId, avatars, upload }
}

test('an avatar is stored under a generated name and served with exactly the uploaded bytes', async (t) => {
  const { app, userId, avatars, upload } = await setup()
  t.after(() => app.close())
  const cases = [
    ['image/png', png, 'png'],
    ['image/jpeg', jpeg, 'jpg'],
    ['image/webp', webp, 'webp'],
  ] as const
  for (const [mime, bytes, extension] of cases) {
    const response = await upload(bytes, mime)
    assert.equal(response.statusCode, 200, response.body)
    const { avatarUrl } = response.json()
    assert.match(
      avatarUrl,
      new RegExp(`^/api/users/avatars/${userId}-[0-9a-f-]{36}\\.${extension}$`)
    )
    const served = await app.inject(avatarUrl.replace('/api/users', ''))
    assert.equal(served.statusCode, 200)
    assert.equal(served.headers['content-type'], mime)
    assert.deepEqual(served.rawPayload, bytes)
  }
  assert.equal(avatars.files.size, 3)
})

test('an avatar is refused when its type, content, size or form is wrong', async (t) => {
  const { app, bearer, userId, avatars, upload } = await setup()
  t.after(() => app.close())

  const refused = [
    [await upload(png, 'image/gif'), 415, 'unsupported avatar mime type'],
    [await upload(jpeg, 'image/png'), 415, 'avatar content does not match its declared mime type'],
    [
      await upload(Buffer.from('<svg/>'), 'image/webp'),
      415,
      'avatar content does not match its declared mime type',
    ],
    [await upload(png, 'image/png', 'file'), 400, 'avatar field is required'],
    [
      await upload(Buffer.concat([png, Buffer.alloc(maxAvatarBytes)]), 'image/png'),
      413,
      'avatar must not exceed 2 MiB',
    ],
  ] as const
  for (const [response, status, error] of refused) {
    assert.equal(response.statusCode, status, error)
    assert.deepEqual(response.json(), { error })
  }
  const notMultipart = await app.inject({
    method: 'POST',
    url: '/me/avatar',
    headers: bearer(userId),
    payload: { avatar: 'x' },
  })
  assert.equal(notMultipart.statusCode, 400)
  assert.deepEqual(notMultipart.json(), { error: 'avatar file is required' })
  for (const subject of [null, 'not-a-uuid', 42]) {
    assert.equal((await upload(png, 'image/png', 'avatar', subject)).statusCode, 401)
  }
  assert.equal(avatars.files.size, 0)
})

test('avatar names are validated before any storage access', async (t) => {
  let reads = 0
  const { app } = await buildTestApp({
    avatars: {
      prepare: async () => undefined,
      write: async () => undefined,
      read: async () => {
        reads++
        return null
      },
    },
  })
  t.after(() => app.close())
  const id = newUserId()

  for (const name of ['..%2F..%2Fetc%2Fpasswd', 'avatar.png', `${id}-${id}.gif`, `${id}.png`]) {
    const response = await app.inject(`/avatars/${name}`)
    assert.equal(response.statusCode, 400, name)
    assert.deepEqual(response.json(), { error: 'invalid file name' })
  }
  assert.equal(reads, 0)
  const absent = await app.inject(`/avatars/${id}-${id}.png`)
  assert.equal(absent.statusCode, 404)
  assert.deepEqual(absent.json(), { error: 'avatar not found' })
  assert.equal(reads, 1)
})
