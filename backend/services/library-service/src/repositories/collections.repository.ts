import type { Pagination } from '@ft/service-kit'
import type { CollectionKind } from '../domain/collection.js'
import type { Database } from './prisma.js'

/** @brief Persiste les références par compte ; les likes réutilisent leur table existante. */
export function createCollectionsRepository(prisma: Database) {
  return {
    /** @brief Lit une page stable, du dernier ajout au plus ancien. */
    async list(userId: string, kind: CollectionKind, { page, pageSize }: Pagination) {
      const skip = (page - 1) * pageSize
      return prisma.$transaction(
        async (tx) => {
          if (kind === 'track') {
            const where = { userId }
            const rows = await tx.trackFavorite.findMany({
              where,
              skip,
              take: pageSize,
              orderBy: [{ createdAt: 'desc' }, { trackId: 'asc' }],
            })
            return {
              total: await tx.trackFavorite.count({ where }),
              items: rows.map((row) => ({
                id: row.trackId,
                createdAt: row.createdAt.toISOString(),
              })),
            }
          }
          const where = { userId, kind }
          const rows = await tx.savedItem.findMany({
            where,
            skip,
            take: pageSize,
            orderBy: [{ createdAt: 'desc' }, { targetId: 'asc' }],
          })
          return {
            total: await tx.savedItem.count({ where }),
            items: rows.map((row) => ({
              id: row.targetId,
              createdAt: row.createdAt.toISOString(),
            })),
          }
        },
        { isolationLevel: 'RepeatableRead' }
      )
    },
    /** @brief Ajout idempotent : répéter la requête conserve la date initiale. */
    async save(userId: string, kind: CollectionKind, id: string) {
      if (kind === 'track')
        await prisma.trackFavorite.upsert({
          where: { userId_trackId: { userId, trackId: id } },
          create: { userId, trackId: id },
          update: {},
        })
      else
        await prisma.savedItem.upsert({
          where: { userId_kind_targetId: { userId, kind, targetId: id } },
          create: { userId, kind, targetId: id },
          update: {},
        })
    },
    /** @brief Retrait idempotent, possible même si la cible est devenue indisponible. */
    async remove(userId: string, kind: CollectionKind, id: string) {
      if (kind === 'track')
        await prisma.trackFavorite.deleteMany({ where: { userId, trackId: id } })
      else await prisma.savedItem.deleteMany({ where: { userId, kind, targetId: id } })
    },
  }
}
/** @brief Opérations injectées au service. */
export type CollectionsRepository = ReturnType<typeof createCollectionsRepository>
