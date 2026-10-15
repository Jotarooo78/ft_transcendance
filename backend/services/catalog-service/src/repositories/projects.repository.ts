/** Stockage des projets ; toutes les écritures d’un projet prennent le même verrou. */
import { DomainError } from '@ft/service-kit'
import type { ProjectInput } from '../domain/project.js'
import type { Database } from './prisma.js'
import type { Prisma } from '../generated/prisma/client.js'
/** Pistes rangées dans l’ordre enregistré, chargées avec le morceau. */
const projectInclude = {
  tracks: { orderBy: [{ discNumber: 'asc' }, { trackNumber: 'asc' }], include: { track: true } },
} satisfies Prisma.ReleaseInclude
/** Projet brut utilisé seulement entre le stockage et le service. */
export type ProjectRow = Prisma.ReleaseGetPayload<{ include: typeof projectInclude }>
/** Construit les opérations avec une connexion possédée par Catalogue. */
export function createProjectsRepository(db: Database) {
  /** Réserve un UUID même avant l’insertion ; évite deux créations concurrentes. */
  async function lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 17))::text`
  }
  /** Lit une version appartenant au compte ; les autres propriétaires restent invisibles. */
  async function owned(tx: Prisma.TransactionClient, id: string, owner: string) {
    const row = await tx.release.findUnique({ where: { id }, include: projectInclude })
    if (!row || row.ownerUserId !== owner) throw new DomainError(404, 'project_not_found')
    return row
  }
  return {
    /** Lit les nettoyages restants du projet, y compris après son abandon. */
    async pending(id: string, owner: string) {
      return (
        (
          await db.release.findFirst({
            where: { id, ownerUserId: owner },
            select: { pendingCleanup: true },
          })
        )?.pendingCleanup ?? []
      )
    },
    /** Retire uniquement l’UUID confirmé ; une autre sauvegarde peut avoir ajouté des fichiers. */
    async cleaned(id: string, owner: string, asset: string) {
      await db.$executeRaw`UPDATE catalog.releases SET pending_cleanup = array_remove(pending_cleanup, ${asset}::uuid) WHERE id=${id}::uuid AND owner_user_id=${owner}::uuid`
    },
    /** Lit uniquement une publication, ou un projet du propriétaire explicitement authentifié. */
    read(id: string, owner?: string) {
      return db.release.findFirst({
        where: {
          id,
          ...(owner
            ? { ownerUserId: owner, status: { not: 'withdrawn' } }
            : { status: 'published' }),
        },
        include: projectInclude,
      })
    },
    /** Lit une page et son total dans un même état de la base. */
    async list(q: string, page: number, pageSize: number, owner?: string, privateList = false) {
      const where: Prisma.ReleaseWhereInput = {
        status: privateList ? { not: 'withdrawn' } : 'published',
        ...(owner ? { ownerUserId: owner } : {}),
        title: { contains: q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' },
      }
      const [items, total] = await db.$transaction(
        [
          db.release.findMany({
            where,
            include: projectInclude,
            orderBy: privateList
              ? [{ updatedAt: 'desc' }, { id: 'asc' }]
              : [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          db.release.count({ where }),
        ],
        { isolationLevel: 'RepeatableRead' }
      )
      return { items, total, page, pageSize }
    },
    /** Sauvegarde sous verrou ; un audio déjà associé ailleurs ne peut pas être détourné. */
    async save(id: string, owner: string, input: ProjectInput, durations: Map<string, number>) {
      return db.$transaction(async (tx) => {
        await lock(tx, id)
        const previous = await tx.release.findUnique({ where: { id }, include: projectInclude })
        if (previous && (previous.ownerUserId !== owner || previous.status === 'withdrawn'))
          throw new DomainError(404, 'project_not_found')
        if (
          previous?.version !== input.expectedVersion &&
          !(previous === null && input.expectedVersion === 0)
        ) {
          // Une réponse perdue peut être retrouvée sans réappliquer une modification ancienne.
          if (
            previous &&
            previous.title === input.title &&
            (previous.description ?? '') === input.description &&
            previous.releaseType === input.releaseType &&
            previous.coverAssetId === input.coverAssetId &&
            JSON.stringify(
              previous.tracks.map((t) => ({
                audioAssetId: t.track.audioAssetId,
                title: t.track.title,
              }))
            ) === JSON.stringify(input.tracks)
          )
            return previous
          throw new DomainError(409, 'version_conflict')
        }
        if (previous?.status === 'published' && input.tracks.length === 0)
          throw new DomainError(400, 'empty_project')
        for (const track of [...input.tracks].sort((a, b) =>
          a.audioAssetId.localeCompare(b.audioAssetId)
        )) {
          await lock(tx, track.audioAssetId)
          const existing = await tx.track.findUnique({
            where: { id: track.audioAssetId },
            include: { releaseTracks: true },
          })
          if (
            existing &&
            (existing.createdByUserId !== owner ||
              existing.status === 'withdrawn' ||
              existing.releaseTracks.some((t) => t.releaseId !== id) ||
              (existing.status === 'published' &&
                !existing.releaseTracks.some((t) => t.releaseId === id)))
          )
            throw new DomainError(409, 'audio_already_used')
        }
        const now = new Date()
        const row = await tx.release.upsert({
          where: { id },
          create: {
            id,
            ownerUserId: owner,
            title: input.title,
            releaseType: input.releaseType,
            description: input.description || null,
            coverAssetId: input.coverAssetId,
          },
          update: {
            title: input.title,
            releaseType: input.releaseType,
            description: input.description || null,
            coverAssetId: input.coverAssetId,
            version: { increment: 1 },
          },
        })
        await tx.releaseTrack.deleteMany({ where: { releaseId: id } })
        for (const [index, track] of input.tracks.entries()) {
          await tx.track.upsert({
            where: { id: track.audioAssetId },
            create: {
              id: track.audioAssetId,
              audioAssetId: track.audioAssetId,
              createdByUserId: owner,
              title: track.title,
              durationMs: BigInt(durations.get(track.audioAssetId)!),
              status: row.status,
              publishedAt: row.status === 'published' ? now : null,
            },
            update: { title: track.title, version: { increment: 1 } },
          })
          await tx.releaseTrack.create({
            data: { releaseId: id, trackId: track.audioAssetId, trackNumber: index + 1 },
          })
        }
        // Une piste retirée d’un brouillon devient un tombstone : son UUID ne peut plus être publié.
        const removed =
          previous?.tracks
            .filter(
              (t) =>
                !input.tracks.some((i) => i.audioAssetId === t.trackId) &&
                t.track.status === 'draft'
            )
            .map((t) => t.trackId) ?? []
        await tx.track.updateMany({
          where: { id: { in: removed }, status: 'draft' },
          data: { status: 'withdrawn', audioAssetId: null },
        })
        if (removed.length)
          await tx.release.update({ where: { id }, data: { pendingCleanup: { push: removed } } })
        return (await tx.release.findUnique({ where: { id }, include: projectInclude }))!
      })
    },
    /** Publie toutes les pistes et le projet dans la même transaction ; date conservée au rejeu. */
    async publish(id: string, owner: string, expectedVersion: number) {
      return db.$transaction(async (tx) => {
        await lock(tx, id)
        const row = await owned(tx, id, owner)
        if (row.status === 'published') return row
        if (row.status !== 'draft') throw new DomainError(404, 'project_not_found')
        if (row.version !== expectedVersion) throw new DomainError(409, 'version_conflict')
        if (!row.tracks.length) throw new DomainError(400, 'empty_project')
        const now = new Date()
        await tx.track.updateMany({
          where: { id: { in: row.tracks.map((t) => t.trackId) }, status: 'draft' },
          data: { status: 'published', publishedAt: now },
        })
        return tx.release.update({
          where: { id },
          data: { status: 'published', releaseDate: now, publishedAt: now, version: { increment: 1 } },
          include: projectInclude,
        })
      })
    },
    /** Abandon durable et répétable ; conserve les identités retirées pour nettoyer Media après panne. */
    async discard(id: string, owner: string, expectedVersion: number) {
      return db.$transaction(async (tx) => {
        await lock(tx, id)
        const row = await owned(tx, id, owner)
        if (row.status === 'published') throw new DomainError(409, 'published_project')
        if (row.status !== 'withdrawn' && row.version !== expectedVersion)
          throw new DomainError(409, 'version_conflict')
        await tx.track.updateMany({
          where: { id: { in: row.tracks.map((t) => t.trackId) }, status: 'draft' },
          data: { status: 'withdrawn', audioAssetId: null },
        })
        await tx.release.update({
          where: { id },
          data: {
            status: 'withdrawn',
            coverAssetId: null,
            pendingCleanup: {
              set: [
                ...new Set([
                  ...row.pendingCleanup,
                  ...row.tracks.filter((t) => t.track.status !== 'published').map((t) => t.trackId),
                ]),
              ],
            },
          },
        })
        return row.tracks.filter((t) => t.track.status !== 'published').map((t) => t.trackId)
      })
    },
  }
}
/** Contrat injectable, utilisé également par les tests sans base. */
export type ProjectsRepository = ReturnType<typeof createProjectsRepository>
