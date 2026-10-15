/** Vérifie que le nettoyage d’un brouillon ne libère jamais un audio encore référencé. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPublicationsService } from '../src/services/publications.service.js'
/** Une référence interdit toute libération ; une panne de suppression conserve une opération répétable. */
test('draft cleanup checks references before release and can retry deletion', async () => {
  const calls: string[] = []
  let referenced = true,
    failDelete = true
  const service = createPublicationsService(
    {
      reserve: async () => null,
      expired: async () => [],
      release: async () => {
        calls.push('release')
      },
    },
    {
      recover: async () => 0,
      remove: async () => {
        calls.push('delete')
        if (failDelete) throw new Error('disk unavailable')
      },
    },
    { isAssetPublished: async () => false, isAssetReferenced: async () => referenced }
  )
  await assert.rejects(service.release('audio', 'owner'), /file_in_use/)
  assert.deepEqual(calls, [])
  referenced = false
  await assert.rejects(service.release('audio', 'owner'), /disk unavailable/)
  failDelete = false
  await service.release('audio', 'owner')
  assert.deepEqual(calls, ['release', 'delete', 'release', 'delete'])
})
