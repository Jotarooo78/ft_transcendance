/**
 * @file track.test.ts
 * @brief Tests des fonctions du domaine : conversion d'un morceau lu en base vers sa forme
 *   publique, et valeurs par défaut de la recherche.
 *
 * @details Ces tests n'utilisent ni serveur ni base : ils appellent directement des fonctions pures
 *   et comparent leur résultat.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toTrackListQuery } from '../src/domain/track-list.js'
import { toTrack } from '../src/domain/track.js'
import { row } from './helpers.js'

test('the public track has explicit units and only public fields', () => {
  const track = toTrack(row)
  assert.equal(track.durationSeconds, 6)
  assert.equal(track.audioUrl, `/api/media/assets/${row.audioAssetId}/audio`)
  assert.deepEqual(
    Object.keys(track).sort(),
    [
      'albumTitle',
      'artistName',
      'audioAssetId',
      'audioUrl',
      'durationMs',
      'durationSeconds',
      'genre',
      'id',
      'title',
    ].sort()
  )
  assert.doesNotThrow(() => JSON.stringify(track))
})

test('a duration that JavaScript cannot represent exactly is refused', () => {
  assert.throws(() => toTrack({ ...row, durationMs: 9007199254740993n }))
  assert.throws(() => toTrack({ ...row, durationMs: 0n }))
  assert.equal(toTrack({ ...row, durationMs: null, audioAssetId: null }).audioUrl, null)
})

test('an empty query gets the documented defaults', () => {
  assert.deepEqual(toTrackListQuery({}), { page: 1, pageSize: 20, q: '', genre: '', sort: 'title' })
})
