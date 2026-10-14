/**
 * @file signup.service.ts
 * @brief Règles métier de l'inscription.
 *
 * @details Un service est la couche qui décide. Il reçoit des données déjà vérifiées, applique les
 *   règles du métier et dit quoi répondre. Il ne connaît ni HTTP (rôle du contrôleur) ni SQL (rôle
 *   du repository).
 */

import type { SignupInput } from '../domain/credentials.js'
import { profileRefused } from '../domain/errors.js'
import type { AccountsRepository } from '../repositories/accounts.repository.js'
import type { ProfileDeliveryService } from './profile-delivery.service.js'

/** @brief Type de l'objet renvoyé par `createSignupService` : l'opération `signup`. */
export type SignupService = ReturnType<typeof createSignupService>
/**
 * @brief Résultat d'une inscription : `registered` (le compte est utilisable) ou `pending` (le
 *   profil n'a pas encore pu être créé).
 */
export type SignupResult = { status: 'registered'; userId: string } | { status: 'pending' }

/**
 * @brief Ce dont le service a besoin : le repository des comptes, le service d'envoi des demandes
 *   de profil et la fonction de hachage.
 */
type Options = {
  /** @brief Création des comptes. */
  accounts: AccountsRepository
  /** @brief Livraison de la demande de profil à Users. */
  delivery: ProfileDeliveryService
  /** @brief Calcule l'empreinte d'un mot de passe. */
  hashPassword: (password: string) => Promise<string>
}

/**
 * @brief Crée le service d'inscription.
 * @param options Repository des comptes, service d'envoi et fonction de hachage du mot de passe.
 * @returns Un objet offrant `signup`.
 */
export function createSignupService({ accounts, delivery, hashPassword }: Options) {
  return {
    /**
     * @brief Inscrit un nouvel utilisateur.
     * @details Étapes : 1) transformer le mot de passe en empreinte, pour ne jamais le stocker en
     *   clair ; 2) créer le compte en attente et sa demande de profil ; 3) envoyer tout de suite la
     *   demande à user-service. Si Users est en panne, l'inscription n'échoue pas : elle répond
     *   `pending`, et la tâche de fond terminera le travail.
     * @param input Données d'inscription déjà vérifiées.
     * @returns `registered` avec l'identifiant du compte, ou `pending`.
     * @throws {DomainError} 409 `ACCOUNT_ALREADY_EXISTS` si l'email est déjà utilisé ; 409
     *   `USERNAME_TAKEN` ou `PROFILE_CONFLICT` si user-service refuse le profil.
     */
    async signup({ email, password, username, displayName }: SignupInput): Promise<SignupResult> {
      const passwordHash = await hashPassword(password)
      const created = await accounts.createPending({ email, passwordHash, username, displayName })
      const result = await delivery.deliver(created.provision)
      if (result.status === 'permanent_failure') {
        throw profileRefused(result.code)
      }
      return result.status === 'delivered'
        ? { status: 'registered', userId: created.userId }
        : { status: 'pending' }
    },
  }
}
