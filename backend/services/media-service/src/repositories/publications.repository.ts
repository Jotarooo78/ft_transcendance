/** Réserve un audio sous le même verrou que sa suppression et sélectionne les envois expirés. */
import type { Database } from './prisma.js'
/** Accès aux réservations, injecté dans les services et remplaçable dans les tests. */
export type PublicationsRepository = ReturnType<typeof createPublicationsRepository>
/** Construit les opérations atomiques de réservation ; aucun accès aux octets du disque. */
export function createPublicationsRepository(database: Database) {
  return {
    /** Une réservation répétée conserve le même morceau ; une suppression gagnante interdit la publication. */
    reserve(id: string, owner: string) {
      return database.$transaction(async (tx) => {
        const changed = await tx.asset.updateMany({
          where: {
            id,
            uploaderUserId: owner,
            state: 'ready',
            purpose: 'audio',
            OR: [
              { publicationTrackId: id },
              {
                publicationTrackId: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            ],
            variants: { some: { renditionKey: 'private-preview', byteSize: { gt: 0n } } },
          },
          data: { publicationTrackId: id, expiresAt: null },
        })
        return changed.count ? tx.asset.findUnique({ where: { id } }) : null
      })
    },
    /** Ne sélectionne jamais les fichiers historiques ni les publications au résultat incertain. */
    async expired() {
      return database.asset.findMany({
        where: { state: 'ready', expiresAt: { lte: new Date() }, publicationTrackId: null },
        take: 100,
        orderBy: { expiresAt: 'asc' },
      })
    },
  }
}
