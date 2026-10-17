/**
 * @file conversations.service.ts
 * @brief Règles métier des conversations : ouvrir, lister, compter les non-lus.
 *
 * @details Un service est la couche qui décide. Il reçoit une demande dont la forme a déjà été
 *   vérifiée, applique les règles du métier et dit quoi répondre. Il ne connaît ni HTTP (rôle du
 *   contrôleur) ni SQL (rôle du repository).
 *
 * Règle de sécurité valable pour tout ce fichier : l'identifiant du compte (`me`) vient toujours du
 * jeton de connexion vérifié, jamais d'une donnée envoyée par le client.
 */

import type { Pagination } from '@ft/service-kit'
import type { UsersClient } from '../clients/users.client.js'
import { orderPair, toConversation, type Conversation } from '../domain/conversation.js'
import { cannotChatWithYourself, chatUnavailable, notFriends } from '../domain/errors.js'
import type { ConversationsRepository } from '../repositories/conversations.repository.js'

/** @brief Type de l'objet renvoyé par `createConversationsService`, c'est-à-dire la liste de ses opérations. */
export type ConversationsService = ReturnType<typeof createConversationsService>
/**
 * @brief Une page de conversations telle que le client la reçoit : les conversations, leur nombre
 *   total, le numéro de page et la taille de page.
 */
export type ConversationPage = Pagination & { items: Conversation[]; total: number }

/**
 * @brief Crée le service des conversations.
 * @param conversations Repository qui lit et écrit les conversations.
 * @param users Client qui interroge user-service pour savoir si deux comptes sont amis.
 * @returns Un objet offrant `open`, `list` et `unreadTotal`.
 */
export function createConversationsService(
  conversations: ConversationsRepository,
  users: UsersClient
) {
  return {
    /**
     * @brief Ouvre la conversation avec un ami, ou renvoie celle qui existe déjà.
     * @details Les règles, dans cet ordre : on ne discute pas avec soi-même ; il faut être amis ;
     *   puis on trouve ou on crée la conversation. Rejouer la demande renvoie la même conversation :
     *   l'opération est idempotente.
     * @param me Identifiant du compte connecté.
     * @param peerUserId Identifiant de l'ami, tel que le client l'a envoyé (peut contenir des
     *   majuscules).
     * @returns La conversation, et `created` : vrai si elle vient d'être créée.
     * @throws {DomainError} 400 `cannot_chat_with_yourself` ; 403 `not_friends`.
     * @throws {Error} Si user-service ne répond pas : l'appelant reçoit `503 chat_unavailable`.
     */
    async open(
      me: string,
      peerUserId: string
    ): Promise<{ conversation: Conversation; created: boolean }> {
      const peer = peerUserId.toLowerCase()
      if (peer === me) {
        throw cannotChatWithYourself()
      }
      if (!(await users.areFriends(me, peer))) {
        throw notFriends()
      }
      const { row, created } = await conversations.findOrCreate(...orderPair(me, peer))
      const summary = await conversations.summary(row.id, me)
      if (!summary) {
        throw chatUnavailable()
      }
      return { conversation: toConversation(summary, me), created }
    },

    /**
     * @brief Renvoie une page des conversations du compte, la plus récente d'abord.
     * @param me Identifiant du compte connecté.
     * @param pagination Numéro de page et nombre de conversations par page.
     * @returns La page de conversations, sous leur forme publique.
     */
    async list(me: string, pagination: Pagination): Promise<ConversationPage> {
      const { rows, total } = await conversations.list(me, pagination)
      return { ...pagination, total, items: rows.map((row) => toConversation(row, me)) }
    },

    /**
     * @brief Renvoie le nombre total de messages non lus du compte.
     * @param me Identifiant du compte connecté.
     * @returns `{ total }`, pour le badge de la barre de navigation.
     */
    async unreadTotal(me: string): Promise<{ total: number }> {
      return { total: await conversations.unreadTotal(me) }
    },
  }
}
