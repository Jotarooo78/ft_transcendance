/**
 * @file sessions.repository.ts
 * @brief Lecture et écriture des sessions d'écoute et de leurs événements dans la base de données.
 *
 * @details Un repository est la couche qui parle à la base. Il sait quelles tables lire et comment,
 *   mais ne décide de rien : les règles sont dans domain/progress.ts.
 *
 * Deux tables du schéma `playback` sont concernées : `sessions` (une ligne par écoute, avec le
 * temps crédité) et `events` (une ligne par événement de progression reçu).
 */

import type { Pagination } from '@ft/service-kit'
import { sessionNotFound } from '../domain/errors.js'
import type { SessionTransaction } from '../domain/progress.js'
import type { HistoryRow, SessionRow } from '../domain/session.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createSessionsRepository` : toutes les opérations disponibles
 *   sur les sessions.
 * @details Les services ne dépendent que de ce type. Un test peut fournir à la place un objet en
 *   mémoire qui offre les mêmes opérations.
 */
export type SessionsRepository = ReturnType<typeof createSessionsRepository>

/**
 * @brief Crée le repository des sessions branché sur PostgreSQL.
 * @param prisma Connexion à la base, créée dans server.ts.
 * @returns Un objet offrant `create`, `history` et `withLock`.
 */
export function createSessionsRepository(prisma: Database) {
  return {
    /**
     * @brief Crée une session ouverte, sans aucun événement.
     * @param owner Identifiant du compte qui écoute.
     * @param trackId Identifiant du morceau écouté.
     * @param durationMs Durée du morceau en millisecondes, obtenue du catalogue. Elle est copiée
     *   dans la session et ne changera plus.
     * @returns La session créée.
     */
    create(owner: string, trackId: string, durationMs: number): Promise<SessionRow> {
      return prisma.session.create({
        data: { userId: owner, trackId, trackDurationMs: BigInt(durationMs) },
      })
    },

    /**
     * @brief Lit une page de l'historique d'écoute d'un compte.
     * @details Les sessions les plus récentes viennent en premier. Chaque session est accompagnée
     *   de son dernier événement, pour connaître la position où l'écoute s'est arrêtée.
     * @param owner Identifiant du compte.
     * @param pagination Numéro de page et nombre de sessions par page.
     * @returns Les sessions de la page et le nombre total de sessions du compte.
     */
    history(owner: string, { page, pageSize }: Pagination) {
      const where = { userId: owner }
      return prisma.$transaction(
        async (tx) => {
          const total = await tx.session.count({ where })
          const rows: HistoryRow[] = await tx.session.findMany({
            where,
            orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { events: { orderBy: { sequence: 'desc' }, take: 1 } },
          })
          return { rows, total }
        },
        { isolationLevel: 'RepeatableRead' }
      )
    },

    /**
     * @brief Exécute une opération en ayant réservé la session.
     * @details Le problème à éviter : deux événements de la même session arrivent au même instant ;
     *   sans précaution, chacun lirait le même temps crédité et le second écraserait le calcul du
     *   premier. La requête `SELECT ... FOR UPDATE` réserve la ligne de la session jusqu'à la fin
     *   de la transaction : le second événement attend que le premier ait fini. De plus,
     *   l'événement et la mise à jour de la session sont écrits ensemble : si l'un échoue, rien
     *   n'est enregistré.
     * @param owner Identifiant du compte connecté.
     * @param id Identifiant de la session.
     * @param change Opération à exécuter (en pratique `recordProgress` ou `recordClose`). Elle
     *   reçoit la session et les lectures/écritures autorisées.
     * @returns Ce que `change` renvoie.
     * @throws {DomainError} `404 session_not_found` si la session n'existe pas ou appartient à un
     *   autre compte.
     */
    withLock<T>(owner: string, id: string, change: (tx: SessionTransaction) => Promise<T>) {
      return prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM playback.sessions
          WHERE id = ${id}::uuid AND user_id = ${owner}::uuid
          FOR UPDATE`
        if (!locked[0]) {
          throw sessionNotFound()
        }
        const where = { id }
        return change({
          session: await tx.session.findUniqueOrThrow({ where }),
          getEvent: (sequence) =>
            tx.event.findUnique({ where: { sessionId_sequence: { sessionId: id, sequence } } }),
          createEvent: async (event) => {
            await tx.event.create({ data: { ...event, sessionId: id } })
          },
          saveProgress: (listenedMs, lastSequence) =>
            tx.session.update({ where, data: { listenedMs, lastSequence } }),
          saveClose: (endedAt) => tx.session.update({ where, data: { endedAt } }),
        })
      })
    },
  }
}
