/**
 * @file messages.service.ts
 * @brief Règles métier des messages : envoyer, lire l'historique, supprimer, marquer comme lu.
 *
 * @details Chaque opération commence par vérifier que l'appelant fait partie de la conversation. Si ce
 *   n'est pas le cas, la réponse est `404 conversation_not_found` — jamais `403` — pour qu'un
 *   inconnu qui devine un identifiant n'apprenne même pas que la conversation existe. Ce contrôle
 *   d'appartenance vient **avant** le contrôle d'amitié.
 *
 * Après chaque écriture réussie, le service prévient les comptes connectés par le hub WebSocket. Cette
 * diffusion est un plus : elle n'échoue jamais et ne change jamais le résultat de la requête. Le
 * message est déjà enregistré, et le destinataire le retrouverait de toute façon en lisant
 * l'historique.
 */

import type { UsersClient } from '../clients/users.client.js'
import { lastReadBy, peerOf, type ConversationRow } from '../domain/conversation.js'
import { conversationNotFound, messageNotFound, notFriends } from '../domain/errors.js'
import {
  normalizeBody,
  toHistoryOptions,
  toMessage,
  toSafeNumber,
  type Message,
} from '../domain/message.js'
import type { ConversationsRepository } from '../repositories/conversations.repository.js'
import type { MessagesRepository } from '../repositories/messages.repository.js'
import type { Hub } from '../realtime/hub.js'
import { invalidRequest } from '@ft/service-kit'

/** @brief Type de l'objet renvoyé par `createMessagesService`, c'est-à-dire la liste de ses opérations. */
export type MessagesService = ReturnType<typeof createMessagesService>

/**
 * @brief Crée le service des messages.
 * @param conversations Repository des conversations (appartenance et repère de lecture).
 * @param messages Repository des messages.
 * @param users Client qui interroge user-service pour savoir si deux comptes sont amis.
 * @param hub Hub WebSocket, pour pousser les événements aux comptes connectés.
 * @returns Un objet offrant `send`, `history`, `remove` et `markRead`.
 */
export function createMessagesService(
  conversations: ConversationsRepository,
  messages: MessagesRepository,
  users: UsersClient,
  hub: Hub
) {
  /**
   * @brief Lit la conversation en vérifiant que le compte en fait partie.
   * @param me Identifiant du compte connecté.
   * @param id Identifiant de la conversation.
   * @returns La conversation.
   * @throws {DomainError} 404 `conversation_not_found` si elle n'existe pas ou si le compte n'en fait
   *   pas partie.
   */
  async function memberOf(me: string, id: string): Promise<ConversationRow> {
    const row = await conversations.findForMember(id, me)
    if (!row) {
      throw conversationNotFound()
    }
    return row
  }

  return {
    /**
     * @brief Envoie un message.
     * @details Les règles, dans cet ordre : le texte est valide ; la conversation existe pour
     *   l'appelant ; les deux comptes sont **toujours** amis (vérifié à chaque envoi : si l'amitié a
     *   été supprimée, l'envoi est refusé) ; puis le message est enregistré, et enfin diffusé.
     * @param me Identifiant de l'expéditeur.
     * @param conversationId Identifiant de la conversation.
     * @param rawBody Texte envoyé par le client.
     * @returns Le message créé.
     * @throws {DomainError} 400 `invalid_message` ; 404 `conversation_not_found` ; 403 `not_friends`.
     * @throws {Error} Si user-service ne répond pas : l'appelant reçoit `503 chat_unavailable`.
     */
    async send(me: string, conversationId: string, rawBody: string): Promise<Message> {
      const body = normalizeBody(rawBody)
      const peer = peerOf(await memberOf(me, conversationId), me)
      if (!(await users.areFriends(me, peer))) {
        throw notFriends()
      }
      const message = toMessage(await messages.insert(conversationId, me, body))
      hub.publish([me, peer], { type: 'message.created', conversationId, message })
      return message
    },

    /**
     * @brief Lit une page de l'historique.
     * @details Aucun contrôle d'amitié : l'historique reste lisible après une rupture.
     * @param me Identifiant du compte connecté.
     * @param conversationId Identifiant de la conversation.
     * @param query `before`, `after` et `limit`, reçus en texte.
     * @returns Les messages de la page et `hasMore`.
     * @throws {DomainError} 400 `invalid_request` ; 404 `conversation_not_found`.
     */
    async history(
      me: string,
      conversationId: string,
      query: { before?: string; after?: string; limit?: string }
    ) {
      const options = toHistoryOptions(query)
      await memberOf(me, conversationId)
      const { rows, hasMore } = await messages.page(conversationId, options)
      return { items: rows.map(toMessage), hasMore }
    },

    /**
     * @brief Supprime un de ses messages (suppression logique).
     * @param me Identifiant du compte connecté.
     * @param conversationId Identifiant de la conversation.
     * @param messageId Numéro du message.
     * @returns Le message, désormais sans texte.
     * @throws {DomainError} 404 `conversation_not_found` ; 404 `message_not_found` si le message
     *   n'existe pas, n'est pas dans cette conversation ou est celui de l'autre.
     */
    async remove(me: string, conversationId: string, messageId: bigint): Promise<Message> {
      const peer = peerOf(await memberOf(me, conversationId), me)
      const row = await messages.softDelete(conversationId, messageId, me)
      if (!row) {
        throw messageNotFound()
      }
      const message = toMessage(row)
      hub.publish([me, peer], {
        type: 'message.deleted',
        conversationId,
        messageId: message.id,
      })
      return message
    },

    /**
     * @brief Marque la conversation comme lue jusqu'à un message.
     * @details Le repère ne recule jamais : marquer un message plus ancien que le repère actuel ne
     *   change rien. Seul l'autre compte est prévenu, et seulement si le repère a avancé.
     * @param me Identifiant du compte connecté.
     * @param conversationId Identifiant de la conversation.
     * @param upTo Numéro du dernier message lu.
     * @returns Le repère de lecture après l'opération.
     * @throws {DomainError} 404 `conversation_not_found` ; 400 `invalid_request` si ce message n'est
     *   pas dans cette conversation.
     */
    async markRead(me: string, conversationId: string, upTo: bigint) {
      const row = await memberOf(me, conversationId)
      if (!(await messages.belongs(conversationId, upTo))) {
        throw invalidRequest()
      }
      const previous = lastReadBy(row, me) ?? 0n
      const lastRead = previous > upTo ? previous : upTo
      if (lastRead > previous) {
        await conversations.markRead(row, me, upTo)
        hub.publish([peerOf(row, me)], {
          type: 'conversation.read',
          conversationId,
          byUserId: me,
          lastReadMessageId: toSafeNumber(lastRead),
        })
      }
      return { lastReadMessageId: toSafeNumber(lastRead) }
    },
  }
}
