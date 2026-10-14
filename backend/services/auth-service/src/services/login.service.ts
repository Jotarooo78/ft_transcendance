/**
 * @file login.service.ts
 * @brief Règles métier de la connexion.
 */

import type { LoginInput } from '../domain/credentials.js'
import { invalidCredentials, registrationFailed } from '../domain/errors.js'
import type { Account } from '../domain/registration.js'
import type { AccountsRepository } from '../repositories/accounts.repository.js'

/** @brief Type de l'objet renvoyé par `createLoginService` : l'opération `login`. */
export type LoginService = ReturnType<typeof createLoginService>
/**
 * @brief Résultat d'une connexion : `authenticated` avec le jeton, ou `pending` si le profil du
 *   compte n'est pas encore créé.
 */
export type LoginResult = { status: 'authenticated'; token: string } | { status: 'pending' }

/**
 * @brief Ce dont le service a besoin : le repository des comptes, la fonction qui vérifie un mot de
 *   passe et celle qui fabrique un jeton.
 */
type Options = {
  /** @brief Lecture des comptes. */
  accounts: AccountsRepository
  /** @brief Vérifie un mot de passe contre son empreinte. */
  verifyPassword: (hash: string, password: string) => Promise<boolean>
  /** @brief Signe le jeton d'un compte. */
  signToken: (account: Account) => string
}

/**
 * @brief Crée le service de connexion.
 * @param options Repository des comptes, vérification du mot de passe et fabrication du jeton.
 * @returns Un objet offrant `login`.
 */
export function createLoginService({ accounts, verifyPassword, signToken }: Options) {
  return {
    /**
     * @brief Vérifie un email et un mot de passe, puis délivre un jeton de connexion.
     * @details Étapes : 1) chercher le compte par son email ; 2) comparer le mot de passe saisi à
     *   l'empreinte stockée ; 3) regarder l'état du compte. Seul un compte `active` reçoit un
     *   jeton.
     * @param input Email normalisé et mot de passe saisi.
     * @returns Le jeton, ou `pending` si le profil du compte est encore en cours de création.
     * @throws {DomainError} 401 `invalid credentials` si l'email est inconnu ou le mot de passe
     *   faux ; 409 `REGISTRATION_FAILED` si le profil du compte a été définitivement refusé.
     */
    async login({ email, password }: LoginInput): Promise<LoginResult> {
      const account = await accounts.findByEmail(email)
      if (!account || !(await verifyPassword(account.passwordHash, password))) {
        throw invalidCredentials()
      }
      if (account.state === 'pending_profile') {
        return { status: 'pending' }
      }
      if (account.state === 'profile_failed') {
        throw registrationFailed()
      }
      return { status: 'authenticated', token: signToken(account) }
    },
  }
}
