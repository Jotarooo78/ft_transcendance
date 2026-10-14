/**
 * @file outbox.repository.ts
 * @brief Lecture et mise à jour des demandes de création de profil en attente d'envoi (table
 *   `outbox_messages`).
 *
 * @details Cette table fonctionne comme une boîte d'envoi (« outbox »). Chaque demande y est écrite
 *   au moment de l'inscription avec le statut `pending`. Elle y reste tant que user-service ne l'a
 *   pas confirmée, ce qui permet de la renvoyer après une panne sans rien perdre.
 *
 * Chaque changement d'état met à jour deux choses en même temps, dans une transaction : la demande
 * et le compte concerné.
 */

import { isRecord } from '@ft/service-kit'
import {
  nextAttemptAt,
  type PermanentProvisionCode,
  type ProfileProvision,
} from '../domain/registration.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createOutboxRepository` : les opérations sur les demandes en
 *   attente.
 */
export type OutboxRepository = ReturnType<typeof createOutboxRepository>

/** @brief Une demande telle qu'elle est lue en base, avant conversion. */
type OutboxRow = {
  /** @brief Identifiant du message, repris comme identifiant de la demande. */
  id: string
  /** @brief UUID du compte concerné. */
  aggregateId: string
  /** @brief Version du compte. */
  aggregateVersion: number
  /** @brief Contenu JSON du message : nom affiché et username. */
  payload: unknown
  /** @brief Nombre de livraisons déjà tentées. */
  attempts: number
  /** @brief Date de création du message. */
  createdAt: Date
}

/**
 * @brief Transforme une ligne lue en base en demande de profil utilisable par le code.
 * @param row Ligne lue dans `outbox_messages`.
 * @returns La demande.
 * @throws {Error} Si le contenu de la ligne n'a pas la forme d'une demande de profil.
 */
export function toProfileProvision(row: OutboxRow): ProfileProvision {
  const payload = row.payload
  const isProfile =
    isRecord(payload) &&
    typeof payload.displayName === 'string' &&
    typeof payload.username === 'string'
  if (!isProfile) {
    throw new Error('invalid profile provision payload in outbox')
  }
  return {
    eventId: row.id,
    userId: row.aggregateId,
    aggregateVersion: row.aggregateVersion,
    occurredAt: row.createdAt.toISOString(),
    displayName: payload.displayName as string,
    username: payload.username as string,
    attempts: row.attempts,
  }
}

/**
 * @brief Crée le repository des demandes branché sur PostgreSQL.
 * @details Chaque modification ne s'applique qu'à une demande encore `pending` : une demande déjà
 *   traitée ne peut pas être traitée une seconde fois.
 * @param prisma Connexion à la base.
 * @returns Un objet offrant `listDue`, `markDelivered`, `markAttemptFailed` et
 *   `markPermanentlyFailed`.
 */
export function createOutboxRepository(prisma: Database) {
  /** @brief Fabrique la condition « cette demande, à condition qu'elle soit encore en attente ». */
  const pending = (provision: ProfileProvision) => ({ id: provision.eventId, status: 'pending' })
  /** @brief Fabrique la condition « ce compte, à condition qu'il attende encore son profil ». */
  const awaitingProfile = (provision: ProfileProvision) => ({
    id: provision.userId,
    state: 'pending_profile',
  })

  return {
    /**
     * @brief Lit les demandes en attente dont l'heure du prochain essai est arrivée.
     * @details Les plus anciennes viennent en premier.
     * @param limit Nombre maximal de demandes à lire.
     * @returns Les demandes à renvoyer maintenant.
     */
    async listDue(limit: number): Promise<ProfileProvision[]> {
      const messages = await prisma.outboxMessage.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
        orderBy: { createdAt: 'asc' },
        take: limit,
      })
      return messages.map(toProfileProvision)
    },

    /**
     * @brief Enregistre qu'une demande a abouti : la demande est marquée envoyée et le compte
     *   devient `active`.
     * @param provision Demande confirmée par user-service.
     */
    async markDelivered(provision: ProfileProvision): Promise<void> {
      await prisma.$transaction([
        prisma.outboxMessage.updateMany({
          where: pending(provision),
          data: { status: 'delivered', deliveredAt: new Date(), lastError: null },
        }),
        prisma.account.updateMany({ where: awaitingProfile(provision), data: { state: 'active' } }),
      ])
    },

    /**
     * @brief Enregistre qu'un envoi a échoué et fixe l'heure du prochain essai.
     * @param provision Demande qui n'a pas pu être envoyée.
     * @param errorCode Nom court de l'erreur, gardé pour comprendre la panne.
     */
    async markAttemptFailed(provision: ProfileProvision, errorCode: string): Promise<void> {
      await prisma.outboxMessage.updateMany({
        where: pending(provision),
        data: {
          attempts: { increment: 1 },
          lastError: errorCode,
          nextAttemptAt: nextAttemptAt(provision.attempts + 1),
        },
      })
    },

    /**
     * @brief Enregistre qu'une demande a été définitivement refusée : le compte passe à
     *   `profile_failed` et ne pourra pas se connecter.
     * @param provision Demande refusée par user-service.
     * @param errorCode Raison du refus.
     */
    async markPermanentlyFailed(
      provision: ProfileProvision,
      errorCode: PermanentProvisionCode
    ): Promise<void> {
      await prisma.$transaction([
        prisma.outboxMessage.updateMany({
          where: pending(provision),
          data: { status: 'failed', attempts: { increment: 1 }, lastError: errorCode },
        }),
        prisma.account.updateMany({
          where: awaitingProfile(provision),
          data: { state: 'profile_failed' },
        }),
      ])
    },
  }
}
