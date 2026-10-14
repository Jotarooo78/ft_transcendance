/**
 * @file progress.test.ts
 * @brief Tests des règles de progression et de fermeture d'une session.
 *
 * @details Ils appellent directement les fonctions de domain/progress.ts, sans HTTP ni base, avec
 *   une fausse horloge. Ils vérifient le plafonnement du temps crédité, le renvoi d'un événement
 *   identique, le refus d'un numéro hors séquence et la fermeture répétée.
 */

import { DomainError } from '@ft/service-kit'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordClose, recordProgress } from '../src/domain/progress.js'
import { memoryTransaction, row, start } from './helpers.js'

/**
 * @brief Fabrique une fausse horloge arrêtée un certain nombre de millisecondes après l'ouverture
 *   de la session.
 */
const at = (offsetMs: number) => () => start + offsetMs

test('progress writes event and summary together and bounds credit independently from position', async () => {
  const memory = memoryTransaction()
  const first = await recordProgress(
    memory.tx,
    { sequence: 1, positionMs: 5000, listenedMsTotal: 2000 },
    at(2000)
  )
  assert.equal(first.listenedMs, 2000)
  assert.equal(first.positionMs, 5000)
  assert.equal(first.lastSequence, 1)
  assert.equal(memory.events.size, 1)
  assert.equal(memory.counts.summaries, 1)
  assert.equal(memory.events.get(1)?.listenedMsTotal, 2000n)

  const second = await recordProgress(
    memory.tx,
    { sequence: 2, positionMs: 1000, listenedMsTotal: 3000 },
    at(3000)
  )
  assert.equal(second.listenedMs, 3000)
  assert.equal(second.positionMs, 1000)

  const refused = [
    { sequence: 4, positionMs: 1000, listenedMsTotal: 3000 },
    { sequence: 3, positionMs: 6001, listenedMsTotal: 3000 },
    { sequence: 3, positionMs: 1000, listenedMsTotal: 2000 },
  ]
  for (const input of refused) {
    await assert.rejects(recordProgress(memory.tx, input, at(4000)), DomainError)
    assert.equal(memory.events.size, 2)
    assert.equal(memory.counts.summaries, 2)
    assert.deepEqual(memory.state(), { ...row, listenedMs: 3000n, lastSequence: 2 })
  }

  const excessive = await recordProgress(
    memory.tx,
    { sequence: 3, positionMs: 6000, listenedMsTotal: 1000000 },
    at(3500)
  )
  assert.equal(excessive.listenedMs, 3500)
  assert.equal(memory.events.get(3)?.listenedMsTotal, 1000000n)
  const capped = await recordProgress(
    memory.tx,
    { sequence: 4, positionMs: 6000, listenedMsTotal: 2000000 },
    at(10000)
  )
  assert.equal(capped.listenedMs, 6000)
})

test('a closed session and a clock running backwards never credit time', async () => {
  const closed = memoryTransaction({ ...row, endedAt: new Date(start + 1) })
  await assert.rejects(
    recordProgress(closed.tx, { sequence: 1, positionMs: 1, listenedMsTotal: 1 }),
    DomainError
  )
  assert.equal(closed.events.size, 0)

  const backwards = memoryTransaction()
  const result = await recordProgress(
    backwards.tx,
    { sequence: 1, positionMs: 1, listenedMsTotal: 1000 },
    at(-100)
  )
  assert.equal(result.listenedMs, 0)
})

test('exact retransmissions confirm one event even when older or closed; divergent content conflicts', async () => {
  const memory = memoryTransaction()
  const input = { sequence: 1, positionMs: 1000, listenedMsTotal: 1000 }
  const first = await recordProgress(memory.tx, input, at(1000))
  // La première réponse est supposée perdue après les deux écritures.
  assert.deepEqual(await recordProgress(memory.tx, input, at(3000)), first)
  assert.equal(memory.events.size, 1)
  assert.equal(memory.counts.summaries, 1)

  const second = await recordProgress(
    memory.tx,
    { sequence: 2, positionMs: 2000, listenedMsTotal: 2000 },
    at(2000)
  )
  assert.deepEqual(await recordProgress(memory.tx, input), second)
  for (const divergent of [
    { ...input, positionMs: 1001 },
    { ...input, listenedMsTotal: 1001 },
  ]) {
    await assert.rejects(recordProgress(memory.tx, divergent), DomainError)
  }
  assert.equal(memory.events.size, 2)
  assert.equal(memory.counts.summaries, 2)
  assert.equal(memory.state().listenedMs, 2000n)

  const closed = memoryTransaction({ ...memory.state(), endedAt: new Date(start + 2500) })
  for (const [sequence, event] of memory.events) {
    closed.events.set(sequence, event)
  }
  const confirmed = await recordProgress(closed.tx, input)
  assert.equal(confirmed.endedAt, new Date(start + 2500).toISOString())
  assert.equal(confirmed.positionMs, 2000)
  assert.equal(closed.counts.summaries, 0)
  assert.equal(closed.events.size, 2)
  await assert.rejects(
    recordProgress(closed.tx, { sequence: 3, positionMs: 2000, listenedMsTotal: 2000 }),
    DomainError
  )
})

test('two equal requests under a simulated lock cause one write pair', async () => {
  const memory = memoryTransaction()
  const input = { sequence: 1, positionMs: 1000, listenedMsTotal: 1000 }
  let tail: Promise<unknown> = Promise.resolve()
  const locked = () => {
    const run = tail.then(() => recordProgress(memory.tx, input, at(1000)))
    tail = run
    return run
  }
  const replies = await Promise.all([locked(), locked()])
  assert.deepEqual(replies[0], replies[1])
  assert.equal(memory.events.size, 1)
  assert.equal(memory.counts.summaries, 1)
})

test('closing never ends before the session started and credits nothing', async () => {
  const backwards = memoryTransaction()
  const closed = await recordClose(backwards.tx, at(-1000))
  assert.equal(closed.endedAt, row.startedAt.toISOString())
  assert.equal(backwards.events.size, 0)
  assert.equal(backwards.state().listenedMs, 0n)
})
