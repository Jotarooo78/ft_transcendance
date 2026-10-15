/** Écrit une pochette dans le schéma Media avec verrouillage de l’audio propriétaire et suivi des fichiers remplacés. */
import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '../generated/prisma/client.js'
import type { CoverStore } from '../domain/cover.js'
import { DomainError as FileError } from '@ft/service-kit'

/**
 * Le UPDATE de l’audio verrouille sa ligne jusqu’à la fin de la transaction. DELETE audio utilise la même ligne,
 * donc une variante ne peut pas être ajoutée après le passage à deleting. Les octets sont gérés hors de cette transaction.
 */
export function createCoversRepository(
  database: Pick<PrismaClient, '$transaction' | 'variant'>
): CoverStore {
  /** Renomme la variante active en représentation retirée ; cette trace durable permet le nettoyage après une panne. */
  const detach = async (tx: Prisma.TransactionClient, audioId: string) => {
    await tx.variant.updateMany({
      where: { assetId: audioId, renditionKey: 'cover' },
      data: { renditionKey: `retired-cover-${randomUUID()}` },
    })
  }
  return {
    /** Confirme la nouvelle pochette seulement pour un audio encore disponible de ce compte. */
    replace: (id, uploaderUserId, image, storageKey) =>
      database.$transaction(async (tx) => {
        if (image.purpose !== 'image') throw new FileError(415, 'image_required')
        const locked = await tx.asset.updateMany({
          where: { id, uploaderUserId, purpose: 'audio', state: 'ready' },
          data: { updatedAt: new Date() },
        })
        if (locked.count !== 1) throw new FileError(404, 'file_not_found')
        await detach(tx, id)
        return tx.variant.create({
          data: {
            assetId: id,
            renditionKey: 'cover',
            storageKey,
            mimeType: image.mimeType,
            byteSize: BigInt(image.byteSize),
          },
        })
      }),
    /** Retire l’association sans modifier l’original audio ni perdre la trace des octets à nettoyer. */
    remove: (id, uploaderUserId) =>
      database.$transaction(async (tx) => {
        const locked = await tx.asset.updateMany({
          where: { id, uploaderUserId, purpose: 'audio', state: 'ready' },
          data: { updatedAt: new Date() },
        })
        if (locked.count !== 1) throw new FileError(404, 'file_not_found')
        await detach(tx, id)
      }),
    /** Une pochette confirmée reste protégée même si une autre demande l’a déjà rendue retirée. */
    hasStorageKey: async (storageKey) =>
      Boolean(await database.variant.findUnique({ where: { storageKey }, select: { id: true } })),
    /** Les chemins actifs ne peuvent jamais apparaître dans ce lot de nettoyage. */
    retired: (take) =>
      database.variant.findMany({
        where: { renditionKey: { startsWith: 'retired-cover-' } },
        orderBy: { id: 'asc' },
        take,
      }),
    /** Vérifie de nouveau le caractère retiré avant de supprimer les métadonnées. */
    forgetRetired: async (storageKey) => {
      await database.variant.deleteMany({
        where: { storageKey, renditionKey: { startsWith: 'retired-cover-' } },
      })
    },
  }
}
