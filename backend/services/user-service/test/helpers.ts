/**
 * @file helpers.ts
 * @brief Outils partagés par les tests de user-service.
 *
 * @details Les tests ne démarrent ni base de données ni disque. Ils construisent le serveur avec
 *   `buildApp` en lui donnant de faux repositories et un faux stockage gardés en mémoire, puis lui
 *   envoient des requêtes avec `app.inject`.
 */

import { randomUUID } from 'node:crypto'
import { buildApp, type Dependencies } from '../src/app.js'
import { usernameInUse } from '../src/domain/errors.js'
import type { Presence } from '../src/domain/presence.js'
import type { Profile } from '../src/domain/profile.js'
import type { ProfilesRepository } from '../src/repositories/profiles.repository.js'
import type { SocialRepository } from '../src/repositories/social.repository.js'

/** @brief Secret utilisé pour signer les jetons de connexion dans les tests. */
export const jwtSecret = 'test-jwt-secret'
/** @brief Secret partagé entre services utilisé dans les tests. */
export const internalServiceToken = 'test-internal-token'
/** @brief En-tête HTTP d'un appel interne valide, tel qu'auth-service l'enverrait. */
export const internalHeaders = { authorization: `Bearer ${internalServiceToken}` }

/** @brief Fabrique un profil d'exemple pour un compte donné. */
export const profileOf = (
  userId: string,
  username: string,
  extra: Partial<Profile> = {}
): Profile => ({
  userId,
  displayName: username.toUpperCase(),
  username,
  bio: null,
  avatarUrl: null,
  ...extra,
})

/**
 * @brief Crée de faux repositories gardés en mémoire.
 * @details Ils appliquent les mêmes règles que la base : un username ne peut pas être utilisé deux
 *   fois, et une amitié existe dans les deux sens.
 * @param initial Profils présents au départ.
 * @returns Les faux repositories et leur contenu, que le test peut inspecter.
 */
export function memoryStores(initial: Profile[] = []) {
  const profiles = new Map(initial.map((profile) => [profile.userId, profile]))
  const links = new Set<string>()
  const presences = new Map<string, Presence>()
  const calls = { update: [] as unknown[] }

  const profilesRepository: ProfilesRepository = {
    find: async (userId) => profiles.get(userId) ?? null,
    findPublic: async (userId) => profiles.get(userId) ?? null,
    exists: async (userId) => profiles.has(userId),
    listOthers: async (userId) =>
      [...profiles.values()]
        .filter((profile) => profile.userId !== userId)
        .sort((a, b) => a.username.localeCompare(b.username)),
    findMany: async (userIds) => userIds.flatMap((id) => profiles.get(id) ?? []),
    update: async (userId, values) => {
      calls.update.push({ userId, values })
      const taken = [...profiles.values()].some(
        (profile) => profile.username === values.username && profile.userId !== userId
      )
      if (taken) {
        throw usernameInUse()
      }
      const updated = { ...profiles.get(userId)!, ...values }
      profiles.set(userId, updated)
      return updated
    },
    setAvatar: async (userId, avatarUrl) => {
      const updated = { ...(profiles.get(userId) ?? profileOf(userId, 'new_user')), avatarUrl }
      profiles.set(userId, updated)
      return updated
    },
    clearAvatar: async (userId) => {
      const updated = { ...profiles.get(userId)!, avatarUrl: null }
      profiles.set(userId, updated)
      return updated
    },
  }

  const socialRepository: SocialRepository = {
    link: async (userId, friendId) => {
      links.add(`${userId}>${friendId}`)
      links.add(`${friendId}>${userId}`)
    },
    unlink: async (userId, friendId) => {
      links.delete(`${userId}>${friendId}`)
      links.delete(`${friendId}>${userId}`)
    },
    friendIds: async (userId) =>
      [...links].filter((link) => link.startsWith(`${userId}>`)).map((link) => link.split('>')[1]!),
    setPresence: async (userId, isOnline) => {
      presences.set(userId, { isOnline, lastSeenAt: new Date() })
    },
    findPresence: async (userId) => presences.get(userId) ?? null,
    findPresences: async (userIds) =>
      userIds.flatMap((userId) => {
        const presence = presences.get(userId)
        return presence ? [{ userId, ...presence }] : []
      }),
  }

  return { profiles, links, presences, calls, profilesRepository, socialRepository }
}

/**
 * @brief Crée un faux stockage d'avatars gardé en mémoire.
 * @returns Le faux stockage et la liste des fichiers écrits.
 */
export function memoryAvatars() {
  const files = new Map<string, Buffer>()
  return {
    files,
    storage: {
      prepare: async () => undefined,
      write: async (fileName: string, bytes: Buffer) => {
        files.set(fileName, bytes)
      },
      read: async (fileName: string) => files.get(fileName) ?? null,
      remove: async (fileName: string) => {
        files.delete(fileName)
      },
    },
  }
}

/**
 * @brief Fausse opération qui fait échouer le test si elle est appelée : elle sert à prouver qu'une
 *   route n'utilise pas une dépendance.
 */
const unexpected = async (): Promise<never> => {
  throw new Error('Unexpected call')
}

/**
 * @brief Construit un serveur de test.
 * @param overrides Fausses dépendances que le test veut contrôler.
 * @returns Le serveur, et la fonction `bearer` qui fabrique l'en-tête de connexion d'un compte
 *   donné.
 */
export async function buildTestApp(overrides: Partial<Dependencies> = {}) {
  const stores = memoryStores()
  const app = await buildApp(
    { jwtSecret, internalServiceToken },
    {
      profiles: stores.profilesRepository,
      social: stores.socialRepository,
      provisioning: { provision: unexpected },
      avatars: memoryAvatars().storage,
      ready: async () => undefined,
      logger: false,
      ...overrides,
    }
  )
  await app.ready()
  const bearer = (subject: unknown, claims: Record<string, unknown> = {}) => ({
    authorization: `Bearer ${app.jwt.sign({ ...claims, sub: subject })}`,
  })
  return { app, bearer }
}

/** @brief Fabrique un identifiant de compte aléatoire. */
export const newUserId = () => randomUUID()
