/**
 * @file conversations.repository.ts
 * @brief Lecture et écriture des conversations dans la base de données.
 *
 * @details Un repository est la couche qui parle à la base. Il sait quelles tables lire et comment,
 *   mais ne décide de rien : c'est le service qui l'appelle et qui applique les règles.
 *
 * Précaution appliquée à toutes les lectures de ce fichier : elles filtrent sur l'appartenance. Même
 * si une erreur se glissait ailleurs dans le code, il est impossible d'y lire la conversation de deux
 * autres comptes.
 */

import type { Pagination } from '@ft/service-kit'
import type { ConversationRow, ConversationSummary } from '../domain/conversation.js'
import { countUnread, selectSummaries, toSummary } from './conversation-list.sql.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createConversationsRepository` : toutes les opérations
 *   disponibles sur les conversations.
 * @details Les services ne dépendent que de ce type. Un test peut fournir à la place un objet en
 *   mémoire qui offre les mêmes opérations.
 */
export type ConversationsRepository = ReturnType<typeof createConversationsRepository>

/**
 * @brief Crée le repository des conversations branché sur PostgreSQL.
 * @param prisma Connexion à la base, créée dans server.ts.
 * @returns Un objet offrant `findOrCreate`, `findForMember`, `summary`, `list`, `unreadTotal` et
 *   `markRead`.
 */
export function createConversationsRepository(prisma: Database) {
  /** @brief Condition « ce compte est l'un des deux membres de la conversation ». */
  const memberOf = (me: string) => ({ OR: [{ userAId: me }, { userBId: me }] })

  return {
    /**
     * @brief Renvoie la conversation d'une paire d'amis, en la créant si elle n'existe pas.
     * @details Deux requêtes simultanées (les deux amis cliquent en même temps) doivent aboutir à une
     *   seule conversation. On n'écrit donc pas « lire, puis créer si absente » : entre les deux,
     *   l'autre requête pourrait créer la ligne. On insère avec « ne rien faire si elle existe déjà »
     *   (`skipDuplicates`, soit `ON CONFLICT DO NOTHING` en SQL), puis on relit.
     * @param userAId Le plus petit des deux identifiants (voir `orderPair`).
     * @param userBId Le plus grand des deux identifiants.
     * @returns La conversation, et `created` : vrai si cet appel vient de la créer.
     */
    async findOrCreate(
      userAId: string,
      userBId: string
    ): Promise<{ row: ConversationRow; created: boolean }> {
      const { count } = await prisma.conversation.createMany({
        data: [{ userAId, userBId }],
        skipDuplicates: true,
      })
      const row = await prisma.conversation.findUniqueOrThrow({
        where: { userAId_userBId: { userAId, userBId } },
      })
      return { row, created: count === 1 }
    },

    /**
     * @brief Lit une conversation à laquelle le compte participe.
     * @param id Identifiant de la conversation.
     * @param me Identifiant du compte qui lit.
     * @returns La conversation, ou null si elle n'existe pas ou si le compte n'en fait pas partie.
     */
    findForMember(id: string, me: string): Promise<ConversationRow | null> {
      return prisma.conversation.findFirst({ where: { id, ...memberOf(me) } })
    },

    /**
     * @brief Lit une conversation avec son dernier message et le nombre de messages non lus.
     * @param id Identifiant de la conversation.
     * @param me Identifiant du compte qui lit.
     * @returns Le résumé, ou null si la conversation n'existe pas ou si le compte n'en fait pas partie.
     */
    async summary(id: string, me: string): Promise<ConversationSummary | null> {
      const [row] = await selectSummaries(prisma, me, { id, limit: 1, offset: 0 })
      return row ? toSummary(row) : null
    },

    /**
     * @brief Lit une page des conversations d'un compte.
     * @details La page et le nombre total sont lus dans la même transaction, pour qu'ils décrivent le
     *   même état de la base. Les conversations au message le plus récent viennent en premier.
     * @param me Identifiant du compte.
     * @param pagination Numéro de page et nombre de conversations par page.
     * @returns Les conversations de la page, et le nombre total de conversations du compte.
     */
    async list(me: string, { page, pageSize }: Pagination) {
      const [rows, total] = await prisma.$transaction(
        [
          selectSummaries(prisma, me, { id: null, limit: pageSize, offset: (page - 1) * pageSize }),
          prisma.conversation.count({ where: memberOf(me) }),
        ],
        { isolationLevel: 'RepeatableRead' }
      )
      return { rows: rows.map(toSummary), total }
    },

    /**
     * @brief Compte les messages non lus d'un compte, toutes conversations confondues.
     * @param me Identifiant du compte.
     * @returns Le nombre de messages non lus.
     */
    unreadTotal(me: string): Promise<number> {
      return countUnread(prisma, me)
    },

    /**
     * @brief Avance le repère « lu jusqu'ici » du compte dans une conversation.
     * @details Le repère ne recule jamais : la condition `lastRead < upTo` fait que l'écriture ne
     *   s'applique que s'il avance. Rejouer la même demande ne change donc rien (c'est ce qu'on
     *   appelle une opération idempotente).
     * @param row Conversation, lue au préalable ; elle dit si le compte est A ou B.
     * @param me Identifiant du compte qui a lu.
     * @param upTo Numéro du dernier message lu.
     */
    async markRead(row: ConversationRow, me: string, upTo: bigint): Promise<void> {
      if (row.userAId === me) {
        await prisma.conversation.updateMany({
          where: {
            id: row.id,
            OR: [{ lastReadAMessageId: null }, { lastReadAMessageId: { lt: upTo } }],
          },
          data: { lastReadAMessageId: upTo },
        })
        return
      }
      await prisma.conversation.updateMany({
        where: {
          id: row.id,
          OR: [{ lastReadBMessageId: null }, { lastReadBMessageId: { lt: upTo } }],
        },
        data: { lastReadBMessageId: upTo },
      })
    },
  }
}
