/** Le nettoyage des images doit préserver toute référence active ou réservation concurrente. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlaylistImagesService } from '../src/services/playlist-images.service.js'
import type { Database } from '../src/repositories/prisma.js'
import type { UploadService } from '../src/services/upload.service.js'
/** Simule uniquement les frontières externes ; vérifie les effets du vrai service de nettoyage. */
test('playlist image cleanup retains references, fails closed and respects concurrent reservations', async () => {
  const originalFetch = globalThis.fetch
  const effects: string[] = []
  let referenced = true,
    unavailable = false,
    releaseCount = 1
  const expired = {
    id: 'image',
    playlistId: 'playlist',
    uploaderUserId: 'owner',
    expiresAt: new Date(0),
  }
  globalThis.fetch = async () =>
    unavailable ? new Response('{}', { status: 503 }) : Response.json({ referenced })
  const database = {
    asset: {
      findMany: async () => [expired],
      update: async () => {
        effects.push('renew')
      },
      updateMany: async (query: {
        where: { expiresAt: Date; playlistId: string }
        data: { playlistId: null }
      }) => {
        assert.equal(query.where.expiresAt, expired.expiresAt)
        assert.equal(query.where.playlistId, expired.playlistId)
        assert.equal(query.data.playlistId, null)
        effects.push('release')
        return { count: releaseCount }
      },
    },
  } as unknown as Database
  const service = createPlaylistImagesService(
    database,
    {} as UploadService,
    {
      recover: async () => 0,
      remove: async (owner, id) => {
        assert.equal(owner, 'owner')
        assert.equal(id, 'image')
        effects.push('delete')
      },
    },
    '/unused',
    'http://library.test',
    'test-only-token'
  )
  try {
    await service.cleanup()
    assert.deepEqual(effects, ['renew'])
    effects.length = 0
    unavailable = true
    await assert.rejects(service.cleanup(), /Library unavailable/)
    assert.deepEqual(effects, [])
    unavailable = false
    referenced = false
    releaseCount = 0
    await service.cleanup()
    assert.deepEqual(effects, ['release'])
    effects.length = 0
    releaseCount = 1
    await service.cleanup()
    assert.deepEqual(effects, ['release', 'delete'])
  } finally {
    globalThis.fetch = originalFetch
  }
})
