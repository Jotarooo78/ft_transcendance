/**
 * @file profiles.service.ts
 * @brief Règles métier des profils : lire son profil, le modifier, lire celui d'un autre, lister
 *   les autres utilisateurs.
 *
 * @details Un service est la couche qui décide. Il reçoit une demande déjà vérifiée, applique les
 *   règles du métier et dit quoi répondre. Il ne connaît ni HTTP (rôle du contrôleur) ni SQL (rôle
 *   du repository).
 */

import { profileNotFound } from '../domain/errors.js'
import { onlineStatus } from '../domain/presence.js'
import {
  toProfile,
  type Profile,
  type ProfileUpdate,
  type PublicProfile,
} from '../domain/profile.js'
import type { ProfilesRepository } from '../repositories/profiles.repository.js'
import type { SocialRepository } from '../repositories/social.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createProfilesService`, c'est-à-dire la liste de ses
 *   opérations.
 */
export type ProfilesService = ReturnType<typeof createProfilesService>

/**
 * @brief Crée le service des profils.
 * @param profiles Repository des profils.
 * @param social Repository de la présence, utilisé pour afficher qui est en ligne dans l'annuaire.
 * @returns Un objet offrant `me`, `update`, `publicProfile` et `directory`.
 */
export function createProfilesService(profiles: ProfilesRepository, social: SocialRepository) {
  return {
    /**
     * @brief Renvoie le profil complet de l'utilisateur connecté.
     * @param userId Identifiant du compte, lu dans son jeton de connexion.
     * @returns Le profil.
     * @throws {DomainError} 404 `profile not found` si le compte n'a pas de profil.
     */
    async me(userId: string): Promise<Profile> {
      const profile = await profiles.find(userId)
      if (!profile) {
        throw profileNotFound()
      }
      return toProfile(profile)
    },

    /**
     * @brief Modifie le profil de l'utilisateur connecté.
     * @param userId Identifiant du compte.
     * @param values Champs déjà vérifiés.
     * @returns Le profil à jour.
     * @throws {DomainError} 409 `username already in use`.
     */
    async update(userId: string, values: ProfileUpdate): Promise<Profile> {
      return toProfile(await profiles.update(userId, values))
    },

    /**
     * @brief Renvoie le profil public d'un compte quelconque.
     * @param userId Identifiant du compte demandé.
     * @returns Le profil sans la bio.
     * @throws {DomainError} 404 `profile not found`.
     */
    async publicProfile(userId: string): Promise<PublicProfile> {
      const profile = await profiles.findPublic(userId)
      if (!profile) {
        throw profileNotFound()
      }
      return profile
    },

    /**
     * @brief Renvoie l'annuaire : tous les autres utilisateurs, avec leur état en ligne.
     * @details Les profils et les présences sont lus séparément puis assemblés ici.
     * @param userId Identifiant de l'utilisateur connecté, qui n'apparaît pas dans la liste.
     * @returns Les profils, classés par username.
     */
    async directory(userId: string) {
      const others = await profiles.listOthers(userId)
      const presences = await social.findPresences(others.map((profile) => profile.userId))
      const presenceOf = new Map(presences.map((presence) => [presence.userId, presence]))
      const now = Date.now()
      return others.map((profile) => ({
        ...toProfile(profile),
        onlineStatus: onlineStatus(presenceOf.get(profile.userId), now),
      }))
    },
  }
}
