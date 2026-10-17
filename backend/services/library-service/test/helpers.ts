/**
 * @file helpers.ts
 * @brief Outils partagés par les tests de library-service.
 *
 * @details Les tests ne démarrent ni base de données ni réseau. Ils construisent le serveur avec
 *   `buildApp` en lui donnant un faux repository en mémoire, puis lui envoient des requêtes avec
 *   `app.inject`. Ce fichier fournit ce faux repository, des identifiants d'exemple et la fonction
 *   qui construit le serveur de test.
 */

import { buildApp, type Dependencies } from '../src/app.js'
import { itemNotFound, playlistNotFound, versionConflict } from '../src/domain/errors.js'
import type { PlaylistRow } from '../src/domain/playlist.js'
import type { PlaylistKey } from '../src/repositories/playlist-lock.js'
import type { PlaylistsRepository } from '../src/repositories/playlists.repository.js'

/** @brief Identifiant du compte propriétaire de la playlist d'exemple. */
export const owner = '40000000-0000-4000-8000-000000000001'
/**
 * @brief Identifiant d'un autre compte, utilisé pour vérifier qu'il ne peut pas accéder à la
 *   playlist du premier.
 */
export const other = '40000000-0000-4000-8000-000000000002'
/** @brief Identifiant de la playlist d'exemple. */
export const playlistId = '50000000-0000-4000-8000-000000000001'
/** @brief Identifiant d'un morceau d'exemple. */
export const trackId = '20000000-0000-4000-8000-000000000001'
/** @brief Secret utilisé pour signer les jetons de connexion dans les tests. */
export const jwtSecret = 'test-only-library-secret'

/** @brief Fabrique une playlist vide à la version 1, sous la forme que la base renverrait. */
export const emptyRow = (): PlaylistRow => ({
  id: playlistId,
  name: 'Private',
  description: null,
  version: 1n,
  items: [],
})

/**
 * @brief Crée un faux repository qui garde une seule playlist en mémoire.
 * @details Il applique les mêmes règles que le vrai : vérification du propriétaire, comparaison de
 *   la version, version augmentée de 1 à chaque modification. Les tests peuvent ainsi vérifier le
 *   comportement des routes sans base de données.
 * @param initial Playlist présente au départ, ou null pour partir sans playlist.
 * @returns Le faux repository, et son état : la playlist actuelle, le nombre d'écritures (`writes`)
 *   et un interrupteur `failure` pour simuler une panne de base.
 */
export function createFakePlaylists(initial: PlaylistRow | null = emptyRow()) {
  const state = { row: initial, writes: 0, failure: false }

  const locked = (key: PlaylistKey): PlaylistRow => {
    if (state.failure) {
      throw new Error('private SQL')
    }
    if (!state.row || key.owner !== owner || key.id !== state.row.id) {
      throw playlistNotFound()
    }
    if (BigInt(key.expectedVersion) !== state.row.version) {
      throw versionConflict()
    }
    return state.row
  }
  const save = (row: PlaylistRow): PlaylistRow => {
    state.writes++
    state.row = { ...row, version: row.version + 1n }
    return state.row
  }
  const visible = (subject: string) => (subject === owner && state.row ? state.row : null)

  const repository: PlaylistsRepository = {
    async findPublic(id) {
      return state.row?.id === id && state.row.visibility === 'public' ? state.row : null
    },
    async list(subject) {
      if (state.failure) {
        throw new Error('private SQL')
      }
      const row = visible(subject)
      return { rows: row ? [row] : [], total: row ? 1 : 0 }
    },
    async find(subject, id) {
      if (state.failure) {
        throw new Error('private SQL')
      }
      const row = visible(subject)
      return row && row.id === id ? row : null
    },
    async create(_subject, input) {
      if (state.failure) {
        throw new Error('private SQL')
      }
      state.writes++
      state.row = { ...emptyRow(), ...input }
      return state.row
    },
    async addItem(key, track) {
      const row = locked(key)
      const position = row.items.length + 1
      return save({
        ...row,
        items: [...row.items, { id: `item-${position}`, trackId: track, position }],
      })
    },
    async removeItem(key, itemId) {
      const row = locked(key)
      if (!row.items.some((item) => item.id === itemId)) {
        throw itemNotFound()
      }
      return save({ ...row, items: row.items.filter((item) => item.id !== itemId) })
    },
    async update(key, changes) {
      return save({ ...locked(key), ...changes })
    },
    async remove(key) {
      locked(key)
      state.writes++
      state.row = null
    },
  }
  return { repository, state }
}

/**
 * @brief Construit un serveur de test.
 * @param overrides Fausses dépendances que le test veut contrôler.
 * @param secret Secret des jetons du serveur de test.
 * @returns Le serveur, et la fonction `bearer` qui fabrique l'en-tête de connexion d'un compte
 *   donné.
 */
export async function buildTestApp(overrides: Partial<Dependencies> = {}, secret = jwtSecret) {
  const app = await buildApp(
    { jwtSecret: secret },
    {
      playlists: createFakePlaylists().repository,
      catalog: { isTrackPublished: async () => true },
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
