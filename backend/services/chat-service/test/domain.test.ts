/**
 * @file domain.test.ts
 * @brief Tests des fonctions pures de domain/ : classement des paires, nettoyage du texte, lecture des
 *   curseurs, forme publique des messages.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderPair } from '../src/domain/conversation.js'
import {
  normalizeContent,
  toHistoryOptions,
  toMessage,
  toMessageId,
  toSafeNumber,
} from '../src/domain/message.js'
import { alice, bob } from './helpers.js'

test('orderPair gives one writing per pair, whatever the order or the case', () => {
  assert.deepEqual(orderPair(alice, bob), [alice, bob])
  assert.deepEqual(orderPair(bob, alice), [alice, bob])
  assert.deepEqual(orderPair(bob.toUpperCase(), alice), [alice, bob])
})

test('normalizeContent trims the text, keeps inner line breaks and counts characters', () => {
  const text = (body: string) => normalizeContent({ body }).body
  assert.equal(text('  salut\ncomment ça va  \n'), 'salut\ncomment ça va')
  assert.equal(text('a'.repeat(2000)).length, 2000)
  assert.equal([...text('😀'.repeat(2000))].length, 2000)
  for (const refused of ['', '   ', '\n\t ', 'a'.repeat(2001), '😀'.repeat(2001)]) {
    assert.throws(() => normalizeContent({ body: refused }), { message: 'invalid_message' })
  }
})

test('normalizeContent accepts a shared track with or without text, never an empty message', () => {
  const track = '20000000-0000-4000-8000-00000000000A'
  assert.deepEqual(normalizeContent({ trackId: track }), {
    body: '',
    trackId: track.toLowerCase(),
  })
  assert.deepEqual(normalizeContent({ body: ' écoute ça ', trackId: track }), {
    body: 'écoute ça',
    trackId: track.toLowerCase(),
  })
  assert.deepEqual(normalizeContent({ body: '   ', trackId: track }).body, '')
  assert.throws(() => normalizeContent({}), { message: 'invalid_message' })
  assert.throws(() => normalizeContent({ body: 'a'.repeat(2001), trackId: track }), {
    message: 'invalid_message',
  })
})

test('history options accept one direction, bound the limit and refuse huge cursors', () => {
  assert.deepEqual(toHistoryOptions({}), { limit: 30 })
  assert.deepEqual(toHistoryOptions({ before: '12', limit: '5' }), { before: 12n, limit: 5 })
  assert.deepEqual(toHistoryOptions({ after: '7' }), { after: 7n, limit: 30 })
  const refused = [
    { before: '1', after: '2' },
    { limit: '101' },
    { limit: '0' },
    { before: '99999999999999999999' },
  ]
  for (const query of refused) {
    assert.throws(() => toHistoryOptions(query), { message: 'invalid_request' })
  }
  assert.equal(toMessageId('42'), 42n)
})

test('a message hides its text once deleted and refuses ids beyond the safe range', () => {
  const row = {
    id: 5n,
    conversationId: 'c',
    senderUserId: alice,
    body: 'secret',
    trackId: '20000000-0000-4000-8000-000000000001',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
  }
  assert.equal(toMessage(row).body, 'secret')
  const deleted = toMessage({ ...row, deletedAt: new Date('2026-01-02T00:00:00.000Z') })
  assert.equal(deleted.body, null)
  assert.equal(deleted.trackId, null)
  assert.equal(deleted.deletedAt, '2026-01-02T00:00:00.000Z')
  assert.equal(toSafeNumber(9007199254740991n), 9007199254740991)
  assert.throws(() => toSafeNumber(9007199254740993n))
})
