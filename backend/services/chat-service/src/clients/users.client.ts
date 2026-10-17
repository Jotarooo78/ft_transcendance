/**
 * @file users.client.ts
 * @brief Appels de chat-service vers user-service.
 *
 * @details Les services ne partagent pas de base de données : chat-service ne peut pas lire la table
 *   des amis, qui appartient à user-service. Pour savoir si deux comptes sont amis, il pose donc la
 *   question à user-service par HTTP, sur une route réservée aux services (`/internal/...`), en
 *   présentant le secret partagé `INTERNAL_SERVICE_TOKEN`.
 *
 * Le dossier `clients/` regroupe ces appels vers d'autres services. Le fichier définit un type (les
 * questions qu'on peut poser) et une fonction qui en fournit la version réelle ; les tests
 * fournissent une fausse version.
 */

import { fetchJson, isRecord } from '@ft/service-kit'

/** @brief Liste des questions que chat-service pose à user-service. */
export type UsersClient = {
  /** @brief Demande à user-service si deux comptes sont amis. */
  areFriends: (userId: string, otherId: string) => Promise<boolean>
}

/**
 * @brief Crée le client de user-service.
 * @param baseUrl Adresse de user-service sur le réseau interne, par exemple
 *   `http://user-service:4001`.
 * @param token Secret partagé entre services (`INTERNAL_SERVICE_TOKEN`).
 * @param timeoutMs Durée maximale d'un appel en millisecondes ; 2 secondes si elle n'est pas
 *   précisée.
 * @returns Un objet offrant les questions de `UsersClient`.
 */
export function createUsersClient(baseUrl: string, token: string, timeoutMs?: number): UsersClient {
  return {
    /**
     * @brief Demande à user-service si deux comptes sont amis.
     * @details Appelle `GET /internal/friendships/<a>/<b>`. Toute réponse autre que `200` avec un
     *   booléen est traitée comme une panne et lève une erreur : on ne renvoie surtout pas `false`,
     *   qui dirait à tort « vous n'êtes pas amis ». Dans le doute, on refuse l'opération plutôt que
     *   de l'autoriser sans vérification.
     * @param userId Identifiant d'un compte.
     * @param otherId Identifiant de l'autre compte.
     * @returns Vrai si les deux comptes sont amis.
     * @throws {Error} Si user-service est injoignable, trop lent, refuse le secret, ou renvoie une
     *   réponse inattendue. L'utilisateur reçoit alors `503 chat_unavailable`.
     */
    async areFriends(userId, otherId) {
      const url = new URL(`/internal/friendships/${userId}/${otherId}`, baseUrl)
      const response = await fetchJson(url, {
        headers: { authorization: `Bearer ${token}` },
        timeoutMs,
      })
      if (
        !response.ok ||
        !isRecord(response.body) ||
        typeof response.body.areFriends !== 'boolean'
      ) {
        throw new Error('Users service unavailable')
      }
      return response.body.areFriends
    },
  }
}
