/** Preuves PostgreSQL des projets. À lancer uniquement contre la base jetable explicitement fournie. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createPrisma } from '../src/repositories/prisma.js'
import { createProjectsRepository } from '../src/repositories/projects.repository.js'
import { createPublicationsRepository } from '../src/repositories/publications.repository.js'
import { buildTestApp } from './helpers.js'
/** La cible doit être la base sans port de la campagne, jamais une URL de développement implicite. */
const url = process.env.PROJECT_TEST_DATABASE_URL
if (!url || new URL(url).hostname !== '127.0.0.1' || !url.includes('isolated_schema_test'))
  throw new Error('Explicit isolated database required')
/** Connexion réelle et identités propres à cette exécution. */
const db = createPrisma(url),
  owner = randomUUID(),
  stranger = randomUUID(),
  id = randomUUID()
/** Les services externes sont simulés ici ; les verrous et écritures SQL sont réels. */
let cleanupUnavailable = false
const projects = createProjectsRepository(db)
const profile = { userId: owner, username: 'artist', displayName: 'Artist', avatarUrl: null }
const app = await buildTestApp({
  projects,
  users: {
    authenticate: async (auth) => ({
      ...profile,
      userId: auth === 'Bearer other' ? stranger : owner,
    }),
    read: async () => profile,
  },
  media: {
    reserve: async (audio) => ({ id: audio, durationMs: 3000 }),
    release: async () => {
      if (cleanupUnavailable) throw new Error('Media unavailable')
    },
  },
})
/** Requête authentifiée ; les tests publics retirent explicitement l’en-tête. */
const headers = { authorization: 'Bearer owner' }
const audio = [randomUUID(), randomUUID(), randomUUID()]
const body = {
  title: 'First mixtape',
  releaseType: 'mixtape',
  description: '',
  coverAssetId: audio[0],
  tracks: audio.map((audioAssetId, i) => ({ audioAssetId, title: `Track ${i}` })),
  expectedVersion: 0,
}
try {
  assert.equal(
    (await app.inject({ method: 'PUT', url: `/me/projects/${id}`, payload: body })).statusCode,
    401
  )
  let response = await app.inject({
    method: 'PUT',
    url: `/me/projects/${id}`,
    payload: body,
    headers,
  })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().version, 1)
  const listed = await app.inject({ url: '/me/projects?page=1&pageSize=24', headers })
  assert.equal(listed.statusCode, 200, listed.body)
  assert(listed.json().items.some((item: { id: string }) => item.id === id))
  assert.equal((await app.inject({ method: 'GET', url: `/projects/${id}` })).statusCode, 404)
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: `/me/projects/${id}`,
        headers: { authorization: 'Bearer other' },
      })
    ).statusCode,
    404
  )
  response = await app.inject({ method: 'PUT', url: `/me/projects/${id}`, payload: body, headers })
  assert.equal(response.json().version, 1, 'lost response retry must not duplicate')
  const changes = ['Edited A', 'Edited B'].map((title) =>
    app.inject({
      method: 'PUT',
      url: `/me/projects/${id}`,
      payload: { ...body, title, expectedVersion: 1 },
      headers,
    })
  )
  assert.deepEqual((await Promise.all(changes)).map((r) => r.statusCode).sort(), [200, 409])
  assert.equal(await db.track.count({ where: { id: { in: audio }, status: 'draft' } }), 3)
  await assert.rejects(
    createPublicationsRepository(db).publish(
      { audioAssetId: audio[0]!, title: 'Bypass', description: '' },
      owner,
      3000
    ),
    /audio_already_used/
  )
  response = await app.inject({
    method: 'POST',
    url: `/me/projects/${id}/publish`,
    payload: { expectedVersion: 2 },
    headers,
  })
  assert.equal(response.statusCode, 200, response.body)
  const date = response.json().releaseDate
  const firstPublication = (await db.release.findUniqueOrThrow({ where: { id } })).publishedAt
  assert.ok(firstPublication)
  assert.equal(await db.track.count({ where: { id: { in: audio }, status: 'published' } }), 3)
  response = await app.inject({
    method: 'POST',
    url: `/me/projects/${id}/publish`,
    payload: { expectedVersion: 2 },
    headers,
  })
  assert.equal(response.json().releaseDate, date)
  response = await app.inject({
    method: 'PUT',
    url: `/me/projects/${id}`,
    payload: { ...body, expectedVersion: 3, tracks: [...body.tracks].reverse() },
    headers,
  })
  assert.equal(response.statusCode, 200, response.body)
  assert.equal(response.json().releaseDate, date)
  assert.deepEqual(
    response.json().tracks.map((t: { id: string }) => t.id),
    [...audio].reverse()
  )
  assert.equal((await db.release.findUniqueOrThrow({ where: { id } })).publishedAt?.toISOString(), firstPublication.toISOString())
  assert.equal((await projects.list('', 1, 24)).items[0]?.id, id)
  const draft = randomUUID(),
    draftAudio = randomUUID()
  response = await app.inject({
    method: 'PUT',
    url: `/me/projects/${draft}`,
    payload: { ...body, coverAssetId: null, tracks: [{ audioAssetId: draftAudio, title: '' }] },
    headers,
  })
  assert.equal(response.statusCode, 200, response.body)
  cleanupUnavailable = true
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/me/projects/${draft}`,
        payload: { expectedVersion: 1 },
        headers,
      })
    ).statusCode,
    503
  )
  assert.deepEqual(await projects.pending(draft, owner), [draftAudio])
  cleanupUnavailable = false
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/me/projects/${draft}`,
        payload: { expectedVersion: 1 },
        headers,
      })
    ).statusCode,
    204
  )
  assert.equal(
    (
      await app.inject({
        method: 'DELETE',
        url: `/me/projects/${draft}`,
        payload: { expectedVersion: 1 },
        headers,
      })
    ).statusCode,
    204
  )
  assert.equal((await db.track.findUniqueOrThrow({ where: { id: draftAudio } })).audioAssetId, null)
  await assert.rejects(
    createPublicationsRepository(db).publish(
      { audioAssetId: draftAudio, title: 'Bypass removed', description: '' },
      owner,
      3000
    ),
    /audio_already_used/
  )
  console.log(
    'PASS: draft ownership, retry, concurrency, atomic publication, edit order/date and discard in PostgreSQL'
  )
} finally {
  await app.close()
  await db.$disconnect()
}
