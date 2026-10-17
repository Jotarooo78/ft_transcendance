/**
 * @file conversation.ts
 * @brief Règles et conversions d'une conversation : classement de la paire d'amis, repérage de
 *   « l'autre », forme publique renvoyée au client.
 *
 * @details Une conversation relie deux comptes. Pour qu'une paire n'ait qu'une seule ligne en base,
 * les deux identifiants sont toujours rangés dans le même ordre : `userAId` est le plus petit,
 * `userBId` le plus grand. Sans cette règle, (Alice, Bob) et (Bob, Alice) seraient deux lignes
 * différentes, donc deux conversations.
 */

import { toMessage, type Message, type MessageRow } from './message.js'

/** @brief Une conversation telle que la base la renvoie. */
export type ConversationRow = {
  id: string
  userAId: string
  userBId: string
  lastReadAMessageId: bigint | null
  lastReadBMessageId: bigint | null
  lastMessageAt: Date | null
  createdAt: Date
}

/**
 * @brief Une conversation accompagnée de ce qu'il faut pour l'afficher dans une liste : son dernier
 *   message et le nombre de messages que l'appelant n'a pas lus.
 */
export type ConversationSummary = ConversationRow & {
  lastMessage: MessageRow | null
  unreadCount: number
}

/** @brief Une conversation telle que le client la reçoit, vue par l'appelant. */
export type Conversation = {
  id: string
  peerUserId: string
  lastMessage: Message | null
  unreadCount: number
  lastMessageAt: string | null
  createdAt: string
}

/**
 * @brief Range deux identifiants de compte dans l'ordre imposé par la base.
 * @details Les identifiants sont mis en minuscules avant la comparaison. PostgreSQL compare les UUID
 *   octet par octet ; une comparaison de textes en minuscules donne le même ordre, alors qu'une
 *   majuscule le fausserait et ferait refuser l'écriture par la contrainte
 *   `conversations_pair_order_check`.
 * @param first Identifiant d'un compte.
 * @param second Identifiant de l'autre compte.
 * @returns `[plus petit, plus grand]`, en minuscules.
 */
export function orderPair(first: string, second: string): [string, string] {
  const [a, b] = [first.toLowerCase(), second.toLowerCase()]
  return a < b ? [a, b] : [b, a]
}

/**
 * @brief Donne l'identifiant de « l'autre » dans une conversation.
 * @param row Conversation.
 * @param me Identifiant de l'appelant, qui doit en faire partie.
 * @returns L'identifiant de l'autre compte.
 */
export const peerOf = (row: ConversationRow, me: string): string =>
  row.userAId === me ? row.userBId : row.userAId

/**
 * @brief Donne le dernier message lu par l'appelant dans une conversation.
 * @param row Conversation.
 * @param me Identifiant de l'appelant, qui doit en faire partie.
 * @returns Le numéro du dernier message lu, ou null s'il n'a encore rien lu.
 */
export const lastReadBy = (row: ConversationRow, me: string): bigint | null =>
  row.userAId === me ? row.lastReadAMessageId : row.lastReadBMessageId

/**
 * @brief Convertit une conversation de la base en conversation publique, vue par l'appelant.
 * @param summary Conversation avec son dernier message et son nombre de non-lus.
 * @param me Identifiant de l'appelant.
 * @returns La conversation telle que le client la reçoit.
 */
export function toConversation(summary: ConversationSummary, me: string): Conversation {
  return {
    id: summary.id,
    peerUserId: peerOf(summary, me),
    lastMessage: summary.lastMessage ? toMessage(summary.lastMessage) : null,
    unreadCount: summary.unreadCount,
    lastMessageAt: summary.lastMessageAt?.toISOString() ?? null,
    createdAt: summary.createdAt.toISOString(),
  }
}
