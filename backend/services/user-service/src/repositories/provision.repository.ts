/**
 * @file provision.repository.ts
 * @brief Création du profil d'un nouveau compte, à la demande d'auth-service, sans jamais le créer
 *   deux fois.
 *
 * @details La même demande peut arriver plusieurs fois (auth-service la renvoie tant qu'il n'a pas
 *   reçu de réponse). Pour ne créer le profil qu'une fois, chaque demande traitée laisse une trace
 *   dans la table `inbox_messages`, identifiée par son `eventId`. La trace et le profil sont écrits
 *   dans la même transaction : soit les deux existent, soit aucun.
 *
 * Une opération qu'on peut répéter sans changer le résultat est dite « idempotente ».
 */

import { profileConflict, usernameTaken } from '../domain/errors.js'
import type { ProfileProvisionCommand, ProvisionResult } from '../domain/provision.js'
import type { Database } from './prisma.js'
import { isUniqueViolation } from './profiles.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createProvisionRepository` : l'unique opération `provision`.
 */
export type ProvisionRepository = ReturnType<typeof createProvisionRepository>

/**
 * @brief Crée le repository de création de profil branché sur PostgreSQL.
 * @param prisma Connexion à la base.
 * @returns Un objet offrant `provision`.
 */
export function createProvisionRepository(prisma: Database) {
  /**
   * @brief Dit si une demande a déjà été traitée.
   * @param eventId Identifiant unique de la demande.
   * @returns Vrai si sa trace existe en base.
   */
  const wasProcessed = async (eventId: string) => {
    const message = await prisma.inboxMessage.findUnique({
      where: { id: eventId },
      select: { id: true },
    })
    return message !== null
  }

  /**
   * @brief Écrit la trace de la demande et le profil, ensemble, dans une transaction.
   * @param command Demande déjà vérifiée.
   * @returns `created`, ou `already_processed` si la trace existait déjà.
   * @throws {DomainError} 409 `PROFILE_CONFLICT` si le compte a déjà un profil créé par une autre
   *   demande.
   */
  function createOnce(command: ProfileProvisionCommand): Promise<ProvisionResult> {
    const { eventId, type, aggregateId: userId, aggregateVersion, data } = command
    return prisma.$transaction(async (tx) => {
      const processed = await tx.inboxMessage.findUnique({
        where: { id: eventId },
        select: { id: true },
      })
      if (processed) {
        return { status: 'already_processed' as const }
      }
      await tx.inboxMessage.create({
        data: {
          id: eventId,
          type,
          aggregateId: userId,
          aggregateVersion,
          result: { status: 'created' },
        },
      })
      const existing = await tx.profile.findUnique({ where: { userId }, select: { userId: true } })
      if (existing) {
        throw profileConflict()
      }
      await tx.profile.create({ data: { userId, ...data } })
      return { status: 'created' as const }
    })
  }

  /**
   * @brief Cherche pourquoi la base a refusé une création pour cause de valeur en double.
   * @details Trois explications sont possibles : la même demande vient d'être traitée par une
   *   requête parallèle (ce n'est pas une erreur) ; le compte a déjà un profil ; le username est
   *   déjà pris par un autre compte.
   * @param command Demande en cours de traitement.
   * @returns `already_processed` dans le premier cas ; null si aucune explication n'est trouvée.
   * @throws {DomainError} 409 `PROFILE_CONFLICT` ou `USERNAME_TAKEN` dans les deux autres cas.
   */
  async function explainUniqueViolation(
    command: ProfileProvisionCommand
  ): Promise<ProvisionResult | null> {
    if (await wasProcessed(command.eventId)) {
      return { status: 'already_processed' }
    }
    const select = { userId: true }
    const [forUser, forUsername] = await Promise.all([
      prisma.profile.findUnique({ where: { userId: command.aggregateId }, select }),
      prisma.profile.findUnique({ where: { username: command.data.username }, select }),
    ])
    if (forUser) {
      throw profileConflict()
    }
    if (forUsername) {
      throw usernameTaken()
    }
    return null
  }

  return {
    /**
     * @brief Crée le profil d'un compte ; ne fait rien si la demande a déjà été traitée.
     * @param command Demande déjà vérifiée.
     * @returns `created` ou `already_processed`.
     * @throws {DomainError} 409 si le profil ne pourra jamais être créé (username pris, ou profil
     *   déjà existant). Auth-service marque alors l'inscription comme échouée.
     */
    async provision(command: ProfileProvisionCommand): Promise<ProvisionResult> {
      try {
        return await createOnce(command)
      } catch (error) {
        const explained = isUniqueViolation(error) ? await explainUniqueViolation(command) : null
        if (!explained) {
          throw error
        }
        return explained
      }
    },
  }
}
