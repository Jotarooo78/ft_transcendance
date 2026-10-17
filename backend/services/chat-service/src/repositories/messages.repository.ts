/**
 * @file messages.repository.ts
 * @brief Lecture et écriture des messages dans la base de données.
 *
 * @details Même rôle que conversations.repository.ts, pour la table des messages. Ces fonctions ne
 *   vérifient pas que l'appelant fait partie de la conversation : c'est le service qui le fait avant
 *   de les appeler.
 */

import type { HistoryOptions, MessageContent, MessageRow } from '../domain/message.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createMessagesRepository` : toutes les opérations disponibles
 *   sur les messages.
 */
export type MessagesRepository = ReturnType<typeof createMessagesRepository>

/**
 * @brief Crée le repository des messages branché sur PostgreSQL.
 * @param prisma Connexion à la base, créée dans server.ts.
 * @returns Un objet offrant `insert`, `page`, `softDelete` et `belongs`.
 */
export function createMessagesRepository(prisma: Database) {
  return {
    /**
     * @brief Enregistre un message et note la date du dernier message de la conversation.
     * @details Les deux écritures se font dans **une transaction** : elles réussissent toutes les deux
     *   ou échouent toutes les deux, donc la liste des conversations ne peut pas être triée sur une
     *   date qui ne correspond à aucun message. À l'intérieur de la transaction, on utilise `tx` et
     *   jamais `prisma` : une requête faite avec `prisma` sortirait de la transaction sans prévenir.
     * @param conversationId Identifiant de la conversation.
     * @param senderUserId Identifiant de l'expéditeur.
     * @param content Texte déjà nettoyé et morceau partagé (déjà vérifié auprès du catalogue), ou null.
     * @returns Le message créé.
     */
    insert(
      conversationId: string,
      senderUserId: string,
      { body, trackId }: MessageContent
    ): Promise<MessageRow> {
      return prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: { conversationId, senderUserId, body, trackId },
        })
        await tx.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: message.createdAt },
        })
        return message
      })
    },

    /**
     * @brief Lit une page de l'historique d'une conversation.
     * @details On demande une ligne de plus que la limite : si elle existe, c'est qu'il reste des
     *   messages à charger (`hasMore`), sans second comptage. Avec `after`, l'ordre est croissant ;
     *   sinon il est décroissant, le plus récent d'abord.
     * @param conversationId Identifiant de la conversation.
     * @param options `before` ou `after` (le numéro de message d'où partir) et `limit`.
     * @returns Les messages de la page et `hasMore`.
     */
    async page(conversationId: string, { before, after, limit }: HistoryOptions) {
      const rows = await prisma.message.findMany({
        where: {
          conversationId,
          ...(before === undefined ? {} : { id: { lt: before } }),
          ...(after === undefined ? {} : { id: { gt: after } }),
        },
        orderBy: { id: after === undefined ? 'desc' : 'asc' },
        take: limit + 1,
      })
      return { rows: rows.slice(0, limit), hasMore: rows.length > limit }
    },

    /**
     * @brief Supprime un message de façon logique : la ligne reste, `deletedAt` est renseigné.
     * @details Seul l'expéditeur peut supprimer son message. Déjà supprimé : rien ne change et le
     *   message est renvoyé quand même, ce qui rend l'opération rejouable.
     * @param conversationId Identifiant de la conversation.
     * @param id Numéro du message.
     * @param senderUserId Identifiant du compte qui demande la suppression.
     * @returns Le message, ou null s'il n'existe pas, n'est pas dans cette conversation ou n'est pas à
     *   ce compte.
     */
    async softDelete(
      conversationId: string,
      id: bigint,
      senderUserId: string
    ): Promise<MessageRow | null> {
      const where = { id, conversationId, senderUserId }
      await prisma.message.updateMany({
        where: { ...where, deletedAt: null },
        data: { deletedAt: new Date() },
      })
      return prisma.message.findFirst({ where })
    },

    /**
     * @brief Dit si un message appartient à une conversation.
     * @param conversationId Identifiant de la conversation.
     * @param id Numéro du message.
     * @returns Vrai si ce message est dans cette conversation.
     */
    async belongs(conversationId: string, id: bigint): Promise<boolean> {
      const message = await prisma.message.findFirst({
        where: { id, conversationId },
        select: { id: true },
      })
      return message !== null
    },
  }
}
