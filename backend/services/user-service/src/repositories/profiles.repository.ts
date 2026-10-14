/**
 * @file profiles.repository.ts
 * @brief Lecture et écriture des profils dans la base de données.
 *
 * @details Un repository est la couche qui parle à la base. Il sait quelles tables lire et comment,
 *   mais ne décide de rien : ce sont les services qui l'appellent et qui appliquent les règles.
 */

import { usernameInUse } from '../domain/errors.js'
import type { Profile, ProfileUpdate, PublicProfile } from '../domain/profile.js'
import { Prisma } from '../generated/prisma/client.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createProfilesRepository` : toutes les opérations disponibles
 *   sur les profils.
 * @details Les services ne dépendent que de ce type. Un test peut fournir à la place un objet en
 *   mémoire qui offre les mêmes opérations.
 */
export type ProfilesRepository = ReturnType<typeof createProfilesRepository>

/** @brief Liste des colonnes à lire pour obtenir un profil complet. */
const profileFields = {
  userId: true,
  displayName: true,
  username: true,
  bio: true,
  avatarUrl: true,
} as const
/** @brief Liste des colonnes à lire pour obtenir un profil public : les mêmes, sans la bio. */
const publicFields = { userId: true, displayName: true, username: true, avatarUrl: true } as const

/**
 * @brief Dit si une erreur vient d'une valeur en double refusée par la base.
 * @details La base interdit que deux profils aient le même username. Quand une écriture enfreint
 *   cette règle, Prisma lève une erreur de code `P2002`.
 * @param error Erreur levée par Prisma.
 * @returns Vrai s'il s'agit de cette erreur.
 */
export const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

/**
 * @brief Crée le repository des profils branché sur PostgreSQL.
 * @param prisma Connexion à la base, créée dans server.ts.
 * @returns Un objet offrant les lectures et écritures de profils.
 */
export function createProfilesRepository(prisma: Database) {
  return {
    /**
     * @brief Lit le profil complet d'un compte.
     * @param userId Identifiant du compte.
     * @returns Le profil, ou null si le compte n'en a pas.
     */
    find(userId: string): Promise<Profile | null> {
      return prisma.profile.findUnique({ where: { userId }, select: profileFields })
    },

    /**
     * @brief Lit le profil public d'un compte.
     * @param userId Identifiant du compte.
     * @returns Le profil sans la bio, ou null si le compte n'en a pas.
     */
    findPublic(userId: string): Promise<PublicProfile | null> {
      return prisma.profile.findUnique({ where: { userId }, select: publicFields })
    },

    /**
     * @brief Dit si un compte a un profil.
     * @param userId Identifiant du compte.
     * @returns Vrai si le profil existe.
     */
    async exists(userId: string): Promise<boolean> {
      const profile = await prisma.profile.findUnique({
        where: { userId },
        select: { userId: true },
      })
      return profile !== null
    },

    /**
     * @brief Lit tous les profils sauf celui d'un compte, classés par username dans l'ordre
     *   alphabétique.
     * @param userId Identifiant du compte à exclure : celui de l'utilisateur connecté.
     * @returns Les profils des autres comptes.
     */
    listOthers(userId: string): Promise<Profile[]> {
      return prisma.profile.findMany({
        where: { userId: { not: userId } },
        select: profileFields,
        orderBy: { username: 'asc' },
      })
    },

    /**
     * @brief Lit les profils de plusieurs comptes en une seule requête.
     * @param userIds Identifiants des comptes.
     * @returns Les profils trouvés, dans un ordre quelconque.
     */
    findMany(userIds: string[]): Promise<Profile[]> {
      return prisma.profile.findMany({ where: { userId: { in: userIds } }, select: profileFields })
    },

    /**
     * @brief Enregistre les nouvelles valeurs d'un profil.
     * @param userId Identifiant du compte.
     * @param values Champs déjà vérifiés.
     * @returns Le profil à jour.
     * @throws {DomainError} 409 `username already in use` si un autre compte a déjà ce username.
     */
    async update(userId: string, values: ProfileUpdate): Promise<Profile> {
      try {
        return await prisma.profile.update({
          where: { userId },
          data: values,
          select: profileFields,
        })
      } catch (error) {
        throw isUniqueViolation(error) ? usernameInUse() : error
      }
    },

    /**
     * @brief Enregistre l'adresse du nouvel avatar d'un compte.
     * @details Cas rare : si le compte n'a pas encore de profil, un profil provisoire est créé avec
     *   le nom « New user » et un username dérivé de l'identifiant du compte.
     * @param userId Identifiant du compte.
     * @param avatarUrl Adresse publique de l'avatar.
     * @returns Le profil à jour.
     */
    setAvatar(userId: string, avatarUrl: string): Promise<Profile> {
      const placeholder = {
        userId,
        displayName: 'New user',
        username: `user_${userId.slice(0, 8)}`,
      }
      return prisma.profile.upsert({
        where: { userId },
        update: { avatarUrl },
        create: { ...placeholder, avatarUrl },
        select: profileFields,
      })
    },
  }
}
