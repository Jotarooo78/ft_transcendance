/**
 * @file users.client.ts
 * @brief Appels de auth-service vers user-service.
 *
 * @details Le dossier `clients/` regroupe les appels HTTP vers d'autres services. Ici, un seul
 *   appel existe : demander à user-service de créer le profil d'un compte. Cet appel vise une route
 *   interne de user-service, protégée par un secret partagé entre services
 *   (`INTERNAL_SERVICE_TOKEN`) et inaccessible depuis le navigateur.
 */

import { fetchJson, isRecord } from '@ft/service-kit'
import {
  isPermanentProvisionCode,
  PermanentProvisionError,
  profileProvisionType,
  type ProfileProvision,
} from '../domain/registration.js'

/** @brief Liste des demandes que auth-service adresse à user-service. */
export type UsersClient = {
  /**
   * @brief Demande à Users de créer le profil. La demande peut être rejouée sans risque après une réponse
   * perdue. Lève PermanentProvisionError pour un refus définitif, une autre erreur sinon.
   */
  provisionProfile: (provision: ProfileProvision) => Promise<void>
}

/**
 * @brief Réglages du client : adresse de user-service, secret partagé et durée maximale d'un appel.
 */
type Options = { baseUrl: string; internalToken: string; timeoutMs?: number }

/**
 * @brief Crée le client de user-service.
 * @param options Adresse, secret partagé et durée maximale d'un appel (3 secondes si elle n'est pas
 *   précisée).
 * @returns Un objet offrant `provisionProfile`.
 */
export function createUsersClient({
  baseUrl,
  internalToken,
  timeoutMs = 3000,
}: Options): UsersClient {
  const root = baseUrl.replace(/\/$/, '')

  return {
    /**
     * @brief Demande à user-service de créer le profil d'un compte.
     * @details Appelle `PUT /internal/profiles/<identifiant du compte>`. La fonction se termine
     *   normalement si le profil est créé, ou s'il l'avait déjà été par un envoi précédent.
     * @param provision Demande à envoyer.
     * @throws {PermanentProvisionError} Si user-service refuse définitivement (username déjà pris,
     *   ou profil déjà existant) : inutile de réessayer.
     * @throws {Error} Pour toute autre réponse ou panne (service injoignable, trop lent, erreur
     *   500) : la demande sera renvoyée plus tard.
     */
    async provisionProfile(provision) {
      const url = `${root}/internal/profiles/${encodeURIComponent(provision.userId)}`
      const response = await fetchJson(url, {
        method: 'PUT',
        timeoutMs,
        headers: { authorization: `Bearer ${internalToken}` },
        body: {
          eventId: provision.eventId,
          type: profileProvisionType,
          schemaVersion: 1,
          aggregateId: provision.userId,
          aggregateVersion: provision.aggregateVersion,
          occurredAt: provision.occurredAt,
          data: { displayName: provision.displayName, username: provision.username },
        },
      })
      if (response.ok) {
        return
      }
      const code = isRecord(response.body) ? response.body.code : undefined
      if (response.status === 409 && isPermanentProvisionCode(code)) {
        throw new PermanentProvisionError(code)
      }
      throw new Error(`user-service returned HTTP ${response.status}`)
    },
  }
}
