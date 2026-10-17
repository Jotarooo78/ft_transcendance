/** Coordonne identité Users, réservation Media et écriture atomique Catalogue. */
import { DomainError } from '@ft/service-kit'
import { cleanProject, type ProjectInput } from '../domain/project.js'
import type { UsersClient } from '../clients/users.client.js'
import type { MediaClient } from '../clients/media.client.js'
import type { ProjectsRepository, ProjectRow } from '../repositories/projects.repository.js'
/** Crée les opérations de projets sans dépendre du transport HTTP. */
export function createProjectsService(
  store: ProjectsRepository,
  users: UsersClient,
  media: MediaClient
) {
  /** Vérifie une session et en déduit le propriétaire, jamais fourni dans le corps. */
  async function identity(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) throw new DomainError(401, 'unauthorized')
    return users.authenticate(authorization)
  }
  /** Convertit dates et entiers, et ajoute seulement l’identité publique actuelle de l’artiste. */
  async function present(row: ProjectRow) {
    const artist = row.ownerUserId ? await users.read(row.ownerUserId) : null
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? '',
      releaseType: row.releaseType,
      status: row.status,
      version: row.version,
      ownerUserId: row.ownerUserId,
      artist,
      releaseDate: row.releaseDate?.toISOString().slice(0, 10) ?? null,
      coverAssetId: row.coverAssetId,
      coverUrl:
        row.coverAssetId && row.status === 'published'
          ? `/api/media/assets/${row.coverAssetId}/artwork`
          : null,
      tracks: row.tracks.map(({ track }) => ({
        id: track.id,
        title: track.title,
        audioAssetId: track.audioAssetId,
        durationMs: track.durationMs === null ? null : Number(track.durationMs),
        durationSeconds: track.durationMs === null ? null : Number(track.durationMs) / 1000,
        artistName: artist?.displayName ?? '',
        artistUserId: row.ownerUserId,
        artistAvatarUrl: artist?.avatarUrl ?? null,
        albumTitle: row.title,
        genre: '',
        description: track.description ?? '',
        coverUrl:
          row.status === 'published' && (row.coverAssetId ?? track.audioAssetId)
            ? `/api/media/assets/${row.coverAssetId ?? track.audioAssetId}/artwork`
            : null,
        audioUrl:
          row.status === 'published' && track.audioAssetId
            ? `/api/media/assets/${track.audioAssetId}/audio`
            : null,
      })),
    }
  }
  /** Reprend la file durable ; chaque fichier est acquitté seulement après réponse Media. */
  async function cleanup(id: string, owner: string) {
    for (const asset of await store.pending(id, owner)) {
      await media.release(asset, owner)
      await store.cleaned(id, owner, asset)
    }
  }
  return {
    /** Liste paginée ; l’identité authentifiée remplace tout filtre de compte en mode privé. */
    async list(
      query: { q?: string; page?: number; pageSize?: number; owner?: string },
      authorization?: string,
      privateList = false
    ) {
      const owner = privateList ? (await identity(authorization)).userId : query.owner
      const page = await store.list(
        query.q?.trim() ?? '',
        query.page ?? 1,
        query.pageSize ?? 24,
        owner,
        privateList
      )
      return { ...page, items: await Promise.all(page.items.map(present)) }
    },
    /** Les brouillons ne sont jamais révélés par le chemin public. */
    async get(id: string, authorization?: string, privateRead = false) {
      const owner = privateRead ? (await identity(authorization)).userId : undefined
      const row = await store.read(id, owner)
      if (!row) throw new DomainError(404, 'project_not_found')
      return present(row)
    },
    /** Réserve chaque audio prêt avant d’enregistrer ; une réservation incertaine reste protégée. */
    async save(id: string, authorization: string | undefined, body: ProjectInput) {
      const owner = (await identity(authorization)).userId
      const input = cleanProject(body)
      const durations = new Map<string, number>()
      for (const track of input.tracks)
        durations.set(
          track.audioAssetId,
          (await media.reserve(track.audioAssetId, owner)).durationMs
        )
      const saved = await store.save(id, owner, input, durations)
      await cleanup(id, owner)
      return present(saved)
    },
    /** Réutilise les réservations durables avant la transition de publication. */
    async publish(id: string, authorization: string | undefined, version: number) {
      const owner = (await identity(authorization)).userId
      const row = await store.read(id, owner)
      if (!row) throw new DomainError(404, 'project_not_found')
      for (const item of row.tracks) await media.reserve(item.trackId, owner)
      return present(await store.publish(id, owner, version))
    },
    /** Retire d’abord les références ; un retry reprend ensuite le nettoyage des mêmes fichiers. */
    async discard(id: string, authorization: string | undefined, version: number) {
      const owner = (await identity(authorization)).userId
      await store.discard(id, owner, version)
      await cleanup(id, owner)
    },
  }
}
/** Opérations utilisées par l’adaptateur HTTP. */
export type ProjectsService = ReturnType<typeof createProjectsService>
