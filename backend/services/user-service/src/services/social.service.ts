/**
 * @file social.service.ts
 * @brief Règles métier des amitiés et de la présence en ligne.
 *
 * @details Dans ce projet, une amitié est immédiate et réciproque : il n'y a pas de demande à
 *   accepter. Quand A ajoute B, B a aussitôt A dans ses amis.
 */

import { cannotAddYourself, friendNotFound } from '../domain/errors.js'
import { onlineStatus } from '../domain/presence.js'
import { toProfile } from '../domain/profile.js'
import type { ProfilesRepository } from '../repositories/profiles.repository.js'
import type { SocialRepository } from '../repositories/social.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createSocialService`, c'est-à-dire la liste de ses
 *   opérations.
 */
export type SocialService = ReturnType<typeof createSocialService>

/**
 * @brief Crée le service des amitiés et de la présence.
 * @param profiles Repository des profils, pour vérifier qu'un ami existe et lire les profils des
 *   amis.
 * @param social Repository des amitiés et de la présence.
 * @returns Un objet offrant les opérations sur les amis et la présence.
 */
export function createSocialService(profiles: ProfilesRepository, social: SocialRepository) {
  return {
    /**
     * @brief Ajoute un ami à l'utilisateur connecté.
     * @param userId Identifiant de l'utilisateur connecté.
     * @param friendId Identifiant du compte à ajouter.
     * @throws {DomainError} 400 `cannot add yourself` si les deux identifiants sont identiques ;
     *   404 `friend profile not found` si le compte à ajouter n'a pas de profil.
     */
    async addFriend(userId: string, friendId: string): Promise<void> {
      if (friendId === userId) {
        throw cannotAddYourself()
      }
      if (!(await profiles.exists(friendId))) {
        throw friendNotFound()
      }
      await social.link(userId, friendId)
    },

    /**
     * @brief Retire un ami. L'amitié disparaît pour les deux comptes.
     * @param userId Identifiant de l'utilisateur connecté.
     * @param friendId Identifiant de l'ami à retirer.
     */
    removeFriend(userId: string, friendId: string): Promise<void> {
      return social.unlink(userId, friendId)
    },

    /**
     * @brief Dit si deux comptes sont amis ; utilisé par chat-service avant d'autoriser un message.
     * @details Un compte n'est jamais son propre ami : la réponse est alors `false`, sans interroger la
     *   base.
     * @param userId Identifiant du premier compte.
     * @param otherId Identifiant du second compte.
     * @returns Vrai si l'amitié existe.
     */
    areFriends(userId: string, otherId: string): Promise<boolean> {
      if (userId === otherId) {
        return Promise.resolve(false)
      }
      return social.areFriends(userId, otherId)
    },

    /**
     * @brief Renvoie la liste des amis de l'utilisateur connecté.
     * @param userId Identifiant de l'utilisateur connecté.
     * @returns Pour chaque ami : son profil public, son état en ligne et la date de son dernier
     *   signe de vie.
     */
    async friends(userId: string) {
      const friendIds = await social.friendIds(userId)
      if (friendIds.length === 0) {
        return []
      }
      const [friends, presences] = await Promise.all([
        profiles.findMany(friendIds),
        social.findPresences(friendIds),
      ])
      const presenceOf = new Map(presences.map((presence) => [presence.userId, presence]))
      const now = Date.now()
      return friends.map((profile) => {
        const presence = presenceOf.get(profile.userId)
        return {
          ...toProfile(profile),
          onlineStatus: onlineStatus(presence, now),
          lastSeenAt: presence?.lastSeenAt.toISOString() ?? null,
        }
      })
    },

    /**
     * @brief Enregistre un signe de vie : l'utilisateur est toujours sur le site.
     * @param userId Identifiant de l'utilisateur connecté.
     * @returns `{ onlineStatus: 'online' }`.
     */
    async heartbeat(userId: string) {
      await social.setPresence(userId, true)
      return { onlineStatus: 'online' as const }
    },

    /**
     * @brief Déclare l'utilisateur hors ligne, par exemple quand il ferme l'onglet ou se
     *   déconnecte.
     * @param userId Identifiant de l'utilisateur connecté.
     * @returns `{ onlineStatus: 'offline' }`.
     */
    async goOffline(userId: string) {
      await social.setPresence(userId, false)
      return { onlineStatus: 'offline' as const }
    },

    /**
     * @brief Renvoie l'état en ligne d'un compte quelconque.
     * @param userId Identifiant du compte demandé.
     * @returns Son état et la date de son dernier signe de vie.
     */
    async presence(userId: string) {
      const presence = await social.findPresence(userId)
      return {
        userId,
        onlineStatus: onlineStatus(presence),
        lastSeenAt: presence?.lastSeenAt.toISOString() ?? null,
      }
    },
  }
}
