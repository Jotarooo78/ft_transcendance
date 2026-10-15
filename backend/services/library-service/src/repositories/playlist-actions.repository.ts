/** Écritures atomiques de lots, d’ordre et d’annulation ; les UUID des occurrences restent stables. */
import { createHash } from 'node:crypto'
import { DomainError, invalidRequest } from '@ft/service-kit'
import { itemNotFound, playlistNotFound, versionConflict } from '../domain/errors.js'
import type { Database } from './prisma.js'
import type { Tx } from './playlist-lock.js'
import type { PlaylistAction } from '../schemas/playlist-actions.schema.js'
import type { Prisma } from '../generated/prisma/client.js'

/** Chargement canonique partagé par les confirmations. */
const include = { items: { orderBy: { position: 'asc' as const } } }
/** Empreinte de toute l’intention : un UUID ne peut pas désigner deux opérations différentes. */
function fingerprint(action: PlaylistAction) {
  return createHash('sha256')
    .update(JSON.stringify(action, Object.keys(action).sort()))
    .digest('hex')
}
/** Déplace d’abord les positions au-delà des positions existantes pour respecter leur unicité SQL. */
async function reorder(tx: Tx, playlistId: string, itemIds: string[]) {
  const max = await tx.playlistItem.aggregate({ where: { playlistId }, _max: { position: true } })
  const offset = (max._max.position ?? 0) + 1
  if (offset + itemIds.length >= 2147483647) throw new DomainError(409, 'playlist_limit')
  // Mise à jour par occurrence : aucune collision avec une ancienne position ni avec une autre nouvelle.
  for (const [index, id] of itemIds.entries())
    await tx.playlistItem.update({ where: { id }, data: { position: offset + index } })
  for (const [index, id] of itemIds.entries())
    await tx.playlistItem.update({ where: { id }, data: { position: index + 1 } })
}
/** Instantané privé d’un retrait, sans rétablir la playlist entière lors de l’annulation. */
type Undo = {
  id: string
  trackId: string
  addedAt: string
  previous: string | null
  next: string | null
}
/** Fournit les opérations réelles ; le service valide les références Catalogue avant l’écriture. */
export function createPlaylistActionsRepository(prisma: Database) {
  return {
    /** Lit un reçu seulement pour son propriétaire et sa playlist ; vérifie la même intention. */
    async replay(owner: string, id: string, action: PlaylistAction) {
      const receipt = await prisma.playlistChange.findUnique({ where: { id: action.operationId } })
      if (!receipt) return null
      if (
        receipt.ownerUserId !== owner ||
        receipt.playlistId !== id ||
        receipt.fingerprint !== fingerprint(action)
      )
        throw new DomainError(409, 'operation_conflict')
      return prisma.playlist.findFirst({ where: { id, ownerUserId: owner }, include })
    },
    /** Applique une intention une seule fois, sous verrou de la playlist et avec contrôle de version. */
    async change(owner: string, id: string, action: PlaylistAction) {
      return prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            { version: bigint }[]
          >`SELECT version FROM library.playlists WHERE id=${id}::uuid AND owner_user_id=${owner}::uuid FOR UPDATE`
          if (!rows[0]) throw playlistNotFound()
          const receipt = await tx.playlistChange.findUnique({ where: { id: action.operationId } })
          if (receipt) {
            if (
              receipt.ownerUserId !== owner ||
              receipt.playlistId !== id ||
              receipt.fingerprint !== fingerprint(action)
            )
              throw new DomainError(409, 'operation_conflict')
            return tx.playlist.findUniqueOrThrow({ where: { id }, include })
          }
          if (rows[0].version !== BigInt(action.expectedVersion)) throw versionConflict()
          if (rows[0].version >= BigInt(Number.MAX_SAFE_INTEGER))
            throw new DomainError(409, 'playlist_limit')
          const current = await tx.playlistItem.findMany({
            where: { playlistId: id },
            orderBy: { position: 'asc' },
          })
          let undo: Undo | undefined
          if (action.kind === 'add') {
            const seen = new Set(current.map((item) => item.trackId))
            for (const trackId of action.trackIds) {
              if (!action.allowDuplicates && seen.has(trackId))
                throw new DomainError(409, 'duplicate_confirmation_required')
              seen.add(trackId)
            }
            const last = current.at(-1)?.position ?? 0
            if (last + action.trackIds.length >= 2147483647)
              throw new DomainError(409, 'playlist_limit')
            await tx.playlistItem.createMany({
              data: action.trackIds.map((trackId, index) => ({
                playlistId: id,
                trackId,
                position: last + index + 1,
                addedByUserId: owner,
              })),
            })
          } else if (action.kind === 'reorder') {
            const currentIds = new Set(current.map((item) => item.id))
            if (
              action.itemIds.length !== current.length ||
              new Set(action.itemIds).size !== current.length ||
              action.itemIds.some((itemId) => !currentIds.has(itemId))
            )
              throw invalidRequest()
            await reorder(tx, id, action.itemIds)
          } else if (action.kind === 'remove') {
            const index = current.findIndex((item) => item.id === action.itemId)
            const item = current[index]
            if (!item) throw itemNotFound()
            undo = {
              id: item.id,
              trackId: item.trackId,
              addedAt: item.addedAt.toISOString(),
              previous: current[index - 1]?.id ?? null,
              next: current[index + 1]?.id ?? null,
            }
            await tx.playlistItem.delete({ where: { id: item.id } })
          } else {
            const removal = await tx.playlistChange.findFirst({
              where: { id: action.removalId, ownerUserId: owner, playlistId: id },
            })
            if (!removal?.undo || Date.now() - removal.createdAt.getTime() > 60000)
              throw new DomainError(409, 'undo_expired')
            const saved = removal.undo as unknown as Undo
            if (current.some((item) => item.id === saved.id))
              throw new DomainError(409, 'already_restored')
            if ((current.at(-1)?.position ?? 0) >= 2147483646)
              throw new DomainError(409, 'playlist_limit')
            await tx.playlistItem.create({
              data: {
                id: saved.id,
                playlistId: id,
                trackId: saved.trackId,
                addedAt: new Date(saved.addedAt),
                addedByUserId: owner,
                position: (current.at(-1)?.position ?? 0) + 1,
              },
            })
            const order = current.map((item) => item.id)
            const next = saved.next ? order.indexOf(saved.next) : -1
            const previous = saved.previous ? order.indexOf(saved.previous) : -1
            order.splice(
              next >= 0 ? next : previous >= 0 ? previous + 1 : order.length,
              0,
              saved.id
            )
            await reorder(tx, id, order)
          }
          await tx.playlistChange.create({
            data: {
              id: action.operationId,
              playlistId: id,
              ownerUserId: owner,
              fingerprint: fingerprint(action),
              ...(undo ? { undo: undo as unknown as Prisma.InputJsonValue } : {}),
            },
          })
          return tx.playlist.update({ where: { id }, data: { version: { increment: 1 } }, include })
        },
        { timeout: 30000 }
      )
    },
    /** Copie une version accessible sous verrou ; l’UUID cible ne peut créer qu’une seule copie privée. */
    async duplicate(owner: string, sourceId: string, targetId: string, expectedVersion: number) {
      if (sourceId === targetId) throw invalidRequest()
      return prisma.$transaction(
        async (tx) => {
          // Le verrou de source sérialise les retries et une révocation de visibilité concurrente.
          const rows = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM library.playlists WHERE id=${sourceId}::uuid AND (owner_user_id=${owner}::uuid OR visibility='public') FOR UPDATE`
          if (!rows[0]) throw playlistNotFound()
          const existing = await tx.playlistChange.findUnique({ where: { id: targetId } })
          const mark = `duplicate:${sourceId}:${expectedVersion}`
          if (existing) {
            if (existing.ownerUserId !== owner || existing.fingerprint !== mark)
              throw new DomainError(409, 'operation_conflict')
            return tx.playlist.findUniqueOrThrow({ where: { id: existing.playlistId }, include })
          }
          const source = await tx.playlist.findUniqueOrThrow({ where: { id: sourceId }, include })
          if (source.version !== BigInt(expectedVersion)) throw versionConflict()
          const copy = await tx.playlist.create({
            data: {
              id: targetId,
              ownerUserId: owner,
              name: `${source.name.slice(0, 90)} (copy)`,
              description: source.description,
              visibility: 'private',
              items: {
                create: source.items.map((item, index) => ({
                  trackId: item.trackId,
                  position: index + 1,
                  addedByUserId: owner,
                })),
              },
            },
            include,
          })
          await tx.playlistChange.create({
            data: { id: targetId, playlistId: copy.id, ownerUserId: owner, fingerprint: mark },
          })
          return copy
        },
        { timeout: 30000 }
      )
    },
  }
}
/** Dépendance injectable des commandes du parcours. */
export type PlaylistActionsRepository = ReturnType<typeof createPlaylistActionsRepository>
