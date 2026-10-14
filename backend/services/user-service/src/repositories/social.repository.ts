/**
 * @file social.repository.ts
 * @brief Lecture et écriture des amitiés et de la présence en ligne dans la base de données.
 *
 * @details Une amitié entre A et B est enregistrée sous la forme de deux lignes : « A a pour ami B
 *   » et « B a pour ami A ». Lister les amis d'un compte revient alors à une lecture simple.
 */

import type { Presence } from '../domain/presence.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createSocialRepository` : toutes les opérations sur les
 *   amitiés et la présence.
 */
export type SocialRepository = ReturnType<typeof createSocialRepository>
/** @brief Dernier signe de vie d'un compte, accompagné de l'identifiant de ce compte. */
export type UserPresence = Presence & { userId: string }

/** @brief Liste des colonnes à lire pour obtenir une présence. */
const presenceFields = { userId: true, isOnline: true, lastSeenAt: true } as const

/**
 * @brief Crée le repository des amitiés et de la présence branché sur PostgreSQL.
 * @param prisma Connexion à la base.
 * @returns Un objet offrant les lectures et écritures.
 */
export function createSocialRepository(prisma: Database) {
  return {
    /**
     * @brief Enregistre une amitié entre deux comptes, dans les deux sens.
     * @details Si l'amitié existe déjà, rien ne change et aucune erreur n'est levée.
     * @param userId Identifiant du premier compte.
     * @param friendId Identifiant du second compte.
     */
    async link(userId: string, friendId: string): Promise<void> {
      await prisma.friend.createMany({
        data: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
        skipDuplicates: true,
      })
    },

    /**
     * @brief Supprime une amitié, dans les deux sens.
     * @param userId Identifiant du premier compte.
     * @param friendId Identifiant du second compte.
     */
    async unlink(userId: string, friendId: string): Promise<void> {
      await prisma.friend.deleteMany({
        where: {
          OR: [
            { userId, friendId },
            { userId: friendId, friendId: userId },
          ],
        },
      })
    },

    /**
     * @brief Lit la liste des amis d'un compte.
     * @param userId Identifiant du compte.
     * @returns Les identifiants de ses amis.
     */
    async friendIds(userId: string): Promise<string[]> {
      const links = await prisma.friend.findMany({ where: { userId }, select: { friendId: true } })
      return links.map((link) => link.friendId)
    },

    /**
     * @brief Enregistre l'état de présence d'un compte, avec l'heure actuelle.
     * @param userId Identifiant du compte.
     * @param isOnline Vrai pour un signe de vie, faux quand l'utilisateur quitte le site.
     */
    async setPresence(userId: string, isOnline: boolean): Promise<void> {
      const values = { isOnline, lastSeenAt: new Date() }
      await prisma.presence.upsert({
        where: { userId },
        update: values,
        create: { userId, ...values },
      })
    },

    /**
     * @brief Lit le dernier signe de vie d'un compte.
     * @param userId Identifiant du compte.
     * @returns Sa présence, ou null s'il n'en a jamais donné.
     */
    findPresence(userId: string): Promise<Presence | null> {
      return prisma.presence.findUnique({
        where: { userId },
        select: { isOnline: true, lastSeenAt: true },
      })
    },

    /**
     * @brief Lit le dernier signe de vie de plusieurs comptes en une seule requête.
     * @param userIds Identifiants des comptes.
     * @returns Les présences connues ; un compte jamais vu n'y figure pas.
     */
    findPresences(userIds: string[]): Promise<UserPresence[]> {
      return prisma.presence.findMany({
        where: { userId: { in: userIds } },
        select: presenceFields,
      })
    },
  }
}
