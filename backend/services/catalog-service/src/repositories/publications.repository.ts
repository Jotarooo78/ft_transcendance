/** Écriture idempotente des publications et lecture des comptes crédités. */
import type { Database } from './prisma.js'
import type { TrackPublication } from '../domain/publication.js'
/** Centralise les seuls accès SQL ajoutés pour publier depuis un compte. */
export function createPublicationsRepository(prisma: Database) {
  return {
    /** Charge les identités avant la recherche et le tri, pas après pagination. */
    async owners() {
      const rows = await prisma.track.findMany({
        where: { status: 'published', createdByUserId: { not: null } },
        distinct: ['createdByUserId'],
        select: { createdByUserId: true },
      })
      return rows.map((row) => row.createdByUserId!)
    },
    /** L’UUID de l’audio rend doubles clics et reprises convergents. */
    async publish(data: TrackPublication, ownerId: string, durationMs: number) {
      return prisma.track.upsert({
        where: { id: data.audioAssetId },
        update: {},
        create: {
          id: data.audioAssetId,
          audioAssetId: data.audioAssetId,
          title: data.title,
          description: data.description || null,
          createdByUserId: ownerId,
          durationMs: BigInt(durationMs),
          status: 'published',
          publishedAt: new Date(),
        },
        select: { id: true, createdByUserId: true, audioAssetId: true },
      })
    },
  }
}
/** Contrat injectable des écritures de publication. */
export type PublicationsRepository = ReturnType<typeof createPublicationsRepository>
