/**
 * @file helpers.ts
 * @brief Outils partagés par les tests de auth-service.
 *
 * @details Les tests ne démarrent ni base de données ni réseau. Ils construisent le serveur avec
 *   `buildApp` en lui donnant de faux repositories gardés en mémoire, un faux user-service et un
 *   hachage de mot de passe instantané, puis lui envoient des requêtes avec `app.inject`.
 */

import { randomUUID } from 'node:crypto'
import { buildApp, type Dependencies } from '../src/app.js'
import type { RateLimits } from '../src/config/env.js'
import { accountAlreadyExists } from '../src/domain/errors.js'
import type {
  Account,
  PermanentProvisionCode,
  ProfileProvision,
} from '../src/domain/registration.js'
import type { AccountsRepository } from '../src/repositories/accounts.repository.js'
import type { OutboxRepository } from '../src/repositories/outbox.repository.js'

/** @brief Une demande de profil gardée en mémoire, avec son statut. */
type OutboxEntry = { provision: ProfileProvision; status: 'pending' | 'delivered' | 'failed' }

/**
 * @brief Crée de faux repositories gardés en mémoire.
 * @details Ils font évoluer les comptes et les demandes de la même façon que la vraie base.
 * @returns Les faux repositories, ainsi que les comptes et les demandes, que le test peut
 *   inspecter.
 */
export function memoryStore() {
  const accounts = new Map<string, Account>()
  const outbox = new Map<string, OutboxEntry>()
  const setState = (userId: string, state: Account['state']) => {
    const account = [...accounts.values()].find((candidate) => candidate.id === userId)
    if (account?.state === 'pending_profile') {
      account.state = state
    }
  }

  const accountsRepository: AccountsRepository = {
    createPending: async ({ email, passwordHash, displayName, username }) => {
      if (accounts.has(email)) {
        throw accountAlreadyExists()
      }
      const userId = randomUUID()
      accounts.set(email, { id: userId, email, passwordHash, state: 'pending_profile' })
      const provision: ProfileProvision = {
        eventId: randomUUID(),
        userId,
        aggregateVersion: 1,
        occurredAt: new Date().toISOString(),
        displayName,
        username,
        attempts: 0,
      }
      outbox.set(provision.eventId, { provision, status: 'pending' })
      return { userId, provision }
    },
    findByEmail: async (email) => accounts.get(email) ?? null,
  }

  const outboxRepository: OutboxRepository = {
    listDue: async (limit) =>
      [...outbox.values()]
        .filter((entry) => entry.status === 'pending')
        .slice(0, limit)
        .map((entry) => entry.provision),
    markDelivered: async (provision) => {
      outbox.get(provision.eventId)!.status = 'delivered'
      setState(provision.userId, 'active')
    },
    markAttemptFailed: async (provision) => {
      outbox.get(provision.eventId)!.provision.attempts++
    },
    markPermanentlyFailed: async (provision: ProfileProvision, _code: PermanentProvisionCode) => {
      outbox.get(provision.eventId)!.status = 'failed'
      setState(provision.userId, 'profile_failed')
    },
  }

  return { accounts, outbox, accountsRepository, outboxRepository }
}

/**
 * @brief Exemple d'inscription valide. Il contient exprès des espaces et des majuscules, pour
 *   vérifier qu'ils sont nettoyés.
 */
export const validSignup = {
  email: ' Lea@Example.com ',
  password: 'correct horse battery',
  username: ' Lea_2 ',
  displayName: ' Léa ',
}

/** @brief Ce qu'un test peut remplacer : dépendances, stockage et limites de requêtes. */
type Overrides = Partial<Dependencies> & {
  store?: ReturnType<typeof memoryStore>
  rateLimits?: RateLimits
}

/**
 * @brief Construit un serveur de test.
 * @param options Fausses dépendances, stockage et limites que le test veut contrôler.
 * @returns Le serveur, la fonction `post` qui envoie une requête, et le stockage en mémoire.
 */
export async function buildTestApp(options: Overrides = {}) {
  const { store = memoryStore(), rateLimits = {}, ...overrides } = options
  const app = await buildApp(
    { jwtSecret: 'test-jwt-secret', rateLimits },
    {
      accounts: store.accountsRepository,
      outbox: store.outboxRepository,
      users: { provisionProfile: async () => undefined },
      ready: async () => undefined,
      logger: false,
      // Hachage factice : rapide et lisible dans les assertions.
      hashPassword: async (password) => `hashed:${password}`,
      verifyPassword: async (hash, password) => hash === `hashed:${password}`,
      ...overrides,
    }
  )
  await app.ready()
  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url, headers, payload: payload as object })
  return { app, post, store }
}
