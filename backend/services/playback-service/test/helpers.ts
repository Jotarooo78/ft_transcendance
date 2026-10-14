/**
 * @file helpers.ts
 * @brief Outils partagés par les tests de playback-service.
 *
 * @details Les tests ne démarrent ni base de données ni réseau. Ce fichier fournit une session
 *   d'exemple, une fausse « session réservée » en mémoire pour tester les règles de progression, un
 *   faux repository, et la fonction qui construit un serveur de test.
 */

import assert from 'node:assert/strict'
import { buildApp, type Dependencies } from '../src/app.js'
import { sessionNotFound } from '../src/domain/errors.js'
import type { EventRow, SessionTransaction } from '../src/domain/progress.js'
import type { SessionRow } from '../src/domain/session.js'
import type { SessionsRepository } from '../src/repositories/sessions.repository.js'

/** @brief Identifiant du compte propriétaire de la session d'exemple. */
export const owner = '40000000-0000-4000-8000-000000000001'
/** @brief Identifiant du morceau d'exemple. */
export const trackId = '20000000-0000-4000-8000-000000000001'
/** @brief Identifiant de la session d'exemple. */
export const sessionId = '70000000-0000-4000-8000-000000000001'
/** @brief Heure d'ouverture de la session d'exemple, en millisecondes. */
export const start = new Date('2026-01-01T00:00:00Z').getTime()

/**
 * @brief Session d'exemple sous la forme que la base renverrait : ouverte, sans aucun événement.
 */
export const row: SessionRow = {
  id: sessionId,
  trackId,
  trackDurationMs: 6000n,
  startedAt: new Date(start),
  endedAt: null,
  listenedMs: 0n,
  lastSequence: 0,
}

/**
 * @brief Crée une fausse session réservée, gardée en mémoire.
 * @details Elle offre les mêmes lectures et écritures que la vraie, ce qui permet de tester
 *   `recordProgress` et `recordClose` sans base de données.
 * @param initial État de départ de la session.
 * @returns Les opérations, la liste des événements enregistrés et le nombre d'écritures effectuées.
 */
export function memoryTransaction(initial: SessionRow = row) {
  let state = structuredClone(initial)
  const counts = { summaries: 0, closures: 0 }
  const events = new Map<number, EventRow>()
  const tx: SessionTransaction = {
    get session() {
      return state
    },
    getEvent: async (sequence) => events.get(sequence) ?? null,
    createEvent: async (event) => {
      assert.equal(events.has(event.sequence), false)
      events.set(event.sequence, event)
    },
    saveProgress: async (listenedMs, lastSequence) => {
      counts.summaries++
      state = { ...state, listenedMs, lastSequence }
      return state
    },
    saveClose: async (endedAt) => {
      counts.closures++
      state = { ...state, endedAt }
      return state
    },
  }
  return { tx, events, counts, state: () => state }
}

/**
 * @brief Fausse opération qui fait échouer le test si elle est appelée : elle sert à prouver qu'une
 *   route n'utilise pas une dépendance.
 */
const unused = async (): Promise<never> => {
  throw new Error('Unexpected storage call')
}

/**
 * @brief Crée un faux repository dont la seule session appartient au compte `owner`.
 * @param memory Fausse session réservée à utiliser.
 * @returns Le faux repository.
 */
export function fakeSessions(memory = memoryTransaction()): SessionsRepository {
  return {
    create: unused,
    history: unused,
    withLock: async (subject, id, change) => {
      if (subject !== owner || id !== sessionId) {
        throw sessionNotFound()
      }
      return change(memory.tx)
    },
  }
}

/**
 * @brief Construit un serveur de test.
 * @param overrides Fausses dépendances que le test veut contrôler.
 * @returns Le serveur, et la fonction `bearer` qui fabrique l'en-tête de connexion d'un compte
 *   donné.
 */
export async function buildTestApp(overrides: Partial<Dependencies> = {}) {
  const app = await buildApp(
    { jwtSecret: 'test-only-playback-secret' },
    {
      sessions: fakeSessions(),
      catalog: { readTrackDuration: unused },
      ready: async () => undefined,
      logger: false,
      ...overrides,
    }
  )
  await app.ready()
  const bearer = (subject: unknown) => ({
    authorization: `Bearer ${app.jwt.sign({ sub: subject })}`,
  })
  return { app, bearer }
}
