/**
 * @file conversation-list.sql.ts
 * @brief Requêtes SQL écrites à la main qui lisent des conversations avec leur dernier message et
 *   leur nombre de messages non lus.
 *
 * @details Le client Prisma sait lire une table, mais pas faire en une seule requête « pour chaque
 *   conversation, prends son dernier message et compte les messages non lus ». On écrit donc ces
 *   deux requêtes en SQL, avec `$queryRaw`. Les valeurs entre `${}` sont **liées** par Prisma, jamais
 *   collées dans le texte : c'est ce qui protège de l'injection SQL. Ne construis jamais une requête
 *   en concaténant des chaînes.
 *
 * Un message est « non lu » pour moi s'il est écrit par l'autre, n'est pas supprimé, et a un numéro
 * supérieur au dernier message que j'ai marqué comme lu. Ce nombre est calculé à chaque lecture et
 * jamais stocké : un compteur stocké se désynchroniserait au premier message supprimé.
 */

import type { Database } from './prisma.js'
import type { ConversationSummary } from '../domain/conversation.js'

/** @brief Une ligne telle que PostgreSQL la renvoie : noms de colonnes SQL, grands nombres en `bigint`. */
type RawSummary = {
  id: string
  user_a_id: string
  user_b_id: string
  last_read_a_message_id: bigint | null
  last_read_b_message_id: bigint | null
  last_message_at: Date | null
  created_at: Date
  lm_id: bigint | null
  lm_sender_user_id: string | null
  lm_body: string | null
  lm_created_at: Date | null
  lm_deleted_at: Date | null
  unread: bigint
}

/** @brief Réglages d'une lecture de conversations : laquelle (ou `null` pour toutes), et la page. */
export type SummaryQuery = { id: string | null; limit: number; offset: number }

/**
 * @brief Prépare la lecture des conversations d'un compte, sans l'exécuter.
 * @details La requête peut être placée dans une transaction avec un autre comptage : voir
 *   `$transaction` dans conversations.repository.ts. Le dernier message de chaque conversation est
 *   trouvé par une jointure `LATERAL` : une sous-requête qui s'exécute pour chaque conversation et
 *   prend son message au numéro le plus élevé. Les conversations vides viennent en dernier.
 * @param prisma Connexion à la base.
 * @param me Identifiant du compte qui lit.
 * @param query Conversation visée (ou toutes) et page.
 * @returns La lecture, à exécuter avec `await` ou dans une transaction.
 */
export function selectSummaries(prisma: Database, me: string, query: SummaryQuery) {
  return prisma.$queryRaw<RawSummary[]>`
    SELECT c.id, c.user_a_id, c.user_b_id,
           c.last_read_a_message_id, c.last_read_b_message_id,
           c.last_message_at, c.created_at,
           lm.id AS lm_id, lm.sender_user_id AS lm_sender_user_id, lm.body AS lm_body,
           lm.created_at AS lm_created_at, lm.deleted_at AS lm_deleted_at,
           (SELECT count(*) FROM chat.messages u
             WHERE u.conversation_id = c.id
               AND u.sender_user_id <> ${me}::uuid
               AND u.deleted_at IS NULL
               AND u.id > COALESCE(
                     CASE WHEN c.user_a_id = ${me}::uuid
                          THEN c.last_read_a_message_id
                          ELSE c.last_read_b_message_id END, 0)) AS unread
      FROM chat.conversations c
      LEFT JOIN LATERAL (
        SELECT m.id, m.sender_user_id, m.body, m.created_at, m.deleted_at
          FROM chat.messages m
         WHERE m.conversation_id = c.id
         ORDER BY m.id DESC
         LIMIT 1) lm ON true
     WHERE (c.user_a_id = ${me}::uuid OR c.user_b_id = ${me}::uuid)
       AND (${query.id}::uuid IS NULL OR c.id = ${query.id}::uuid)
     ORDER BY c.last_message_at DESC NULLS LAST, c.id
     LIMIT ${query.limit} OFFSET ${query.offset}`
}

/**
 * @brief Convertit une ligne SQL brute en conversation avec son résumé.
 * @param raw Ligne renvoyée par `selectSummaries`.
 * @returns La conversation, avec son dernier message (ou null) et son nombre de non-lus.
 */
export function toSummary(raw: RawSummary): ConversationSummary {
  const hasLastMessage = raw.lm_id !== null
  return {
    id: raw.id,
    userAId: raw.user_a_id,
    userBId: raw.user_b_id,
    lastReadAMessageId: raw.last_read_a_message_id,
    lastReadBMessageId: raw.last_read_b_message_id,
    lastMessageAt: raw.last_message_at,
    createdAt: raw.created_at,
    unreadCount: Number(raw.unread),
    lastMessage: hasLastMessage
      ? {
          id: raw.lm_id!,
          conversationId: raw.id,
          senderUserId: raw.lm_sender_user_id!,
          body: raw.lm_body!,
          createdAt: raw.lm_created_at!,
          deletedAt: raw.lm_deleted_at,
        }
      : null,
  }
}

/**
 * @brief Compte les messages non lus d'un compte dans toutes ses conversations.
 * @param prisma Connexion à la base.
 * @param me Identifiant du compte.
 * @returns Le nombre total de messages non lus.
 */
export async function countUnread(prisma: Database, me: string): Promise<number> {
  const [row] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total
      FROM chat.messages m
      JOIN chat.conversations c ON c.id = m.conversation_id
     WHERE (c.user_a_id = ${me}::uuid OR c.user_b_id = ${me}::uuid)
       AND m.sender_user_id <> ${me}::uuid
       AND m.deleted_at IS NULL
       AND m.id > COALESCE(
             CASE WHEN c.user_a_id = ${me}::uuid
                  THEN c.last_read_a_message_id
                  ELSE c.last_read_b_message_id END, 0)`
  return Number(row?.total ?? 0n)
}
