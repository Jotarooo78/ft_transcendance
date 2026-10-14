/**
 * @file accounts.repository.ts
 * @brief Création et lecture des comptes dans la base de données.
 *
 * @details Un repository est la couche qui parle à la base. Il sait quelles tables lire et comment,
 *   mais ne décide de rien : ce sont les services qui l'appellent et qui appliquent les règles.
 */

import { randomUUID } from 'node:crypto'
import { accountAlreadyExists } from '../domain/errors.js'
import {
  profileProvisionType,
  type Account,
  type AccountState,
  type NewRegistration,
  type ProfileProvision,
} from '../domain/registration.js'
import { Prisma } from '../generated/prisma/client.js'
import { toProfileProvision } from './outbox.repository.js'
import type { Database } from './prisma.js'

/**
 * @brief Type de l'objet renvoyé par `createAccountsRepository` : créer un compte, lire un compte.
 * @details Les services ne dépendent que de ce type. Un test peut fournir à la place un objet en
 *   mémoire.
 */
export type AccountsRepository = ReturnType<typeof createAccountsRepository>
/**
 * @brief Résultat d'une création de compte : l'identifiant du nouveau compte et la demande de
 *   profil à envoyer à Users.
 */
export type CreatedRegistration = { userId: string; provision: ProfileProvision }

/** @brief Liste des états de compte que le code sait traiter. */
const accountStates: AccountState[] = ['pending_profile', 'active', 'profile_failed']
/** @brief Dit si un état lu en base fait partie des états connus. */
const isAccountState = (value: string): value is AccountState =>
  accountStates.includes(value as AccountState)

/**
 * @brief Dit si une erreur vient d'une valeur en double refusée par la base (ici, un email déjà
 *   utilisé).
 */
const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

/**
 * @brief Crée le repository des comptes branché sur PostgreSQL.
 * @param prisma Connexion à la base, créée dans server.ts.
 * @returns Un objet offrant `createPending` et `findByEmail`.
 */
export function createAccountsRepository(prisma: Database) {
  return {
    /**
     * @brief Crée un compte en attente de profil, ainsi que la demande de création de ce profil.
     * @details Les deux lignes (le compte, et la demande dans la table `outbox_messages`) sont
     *   écrites dans la même transaction : soit les deux existent, soit aucune. Il est donc
     *   impossible d'avoir un compte sans demande à envoyer, même si le service s'arrête juste
     *   après. Sans cela, un compte pourrait rester bloqué pour toujours sans profil.
     * @param input Email, empreinte du mot de passe, nom affiché et username.
     * @returns L'identifiant du compte et la demande de profil à envoyer.
     * @throws {DomainError} 409 `ACCOUNT_ALREADY_EXISTS` si un compte utilise déjà cet email.
     */
    async createPending(input: NewRegistration): Promise<CreatedRegistration> {
      const { email, passwordHash, displayName, username } = input
      try {
        return await prisma.$transaction(async (tx) => {
          const account = await tx.account.create({
            data: { email, passwordHash },
            select: { id: true },
          })
          const message = await tx.outboxMessage.create({
            data: {
              id: randomUUID(),
              type: profileProvisionType,
              aggregateId: account.id,
              aggregateVersion: 1,
              payload: { displayName, username },
            },
          })
          return { userId: account.id, provision: toProfileProvision(message) }
        })
      } catch (error) {
        throw isUniqueViolation(error) ? accountAlreadyExists() : error
      }
    },

    /**
     * @brief Lit un compte à partir de son email.
     * @param email Email déjà normalisé.
     * @returns Le compte, ou null si aucun compte n'a cet email.
     * @throws {Error} Si le compte est dans un état que le code ne connaît pas.
     */
    async findByEmail(email: string): Promise<Account | null> {
      const account = await prisma.account.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true, state: true },
      })
      if (!account) {
        return null
      }
      if (!isAccountState(account.state)) {
        throw new Error(`unsupported account state: ${account.state}`)
      }
      return { ...account, state: account.state }
    },
  }
}
