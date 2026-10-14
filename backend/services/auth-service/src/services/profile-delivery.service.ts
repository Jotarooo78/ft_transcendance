/**
 * @file profile-delivery.service.ts
 * @brief Envoi des demandes de création de profil à user-service, et enregistrement du résultat.
 *
 * @details Ce service est utilisé à deux endroits : par l'inscription, qui tente un envoi immédiat,
 *   et par la tâche de fond (workers/outbox.worker.ts), qui retente plus tard les envois qui ont
 *   échoué.
 */

import type { UsersClient } from '../clients/users.client.js'
import {
  PermanentProvisionError,
  type DeliveryResult,
  type ProfileProvision,
} from '../domain/registration.js'
import type { OutboxRepository } from '../repositories/outbox.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createProfileDeliveryService` : envoyer une demande, ou
 *   retenter celles qui sont en attente.
 */
export type ProfileDeliveryService = ReturnType<typeof createProfileDeliveryService>

/**
 * @brief Extrait d'une erreur un nom court à garder en base.
 * @details Seul le nom de l'erreur est gardé, pas son message, qui pourrait contenir des données
 *   sensibles.
 * @param error Erreur survenue pendant l'envoi.
 * @returns Un texte de 80 caractères au plus.
 */
function errorCodeOf(error: unknown): string {
  return error instanceof Error && error.name ? error.name.slice(0, 80) : 'UnknownProvisionError'
}

/**
 * @brief Crée le service d'envoi.
 * @param outbox Repository des demandes en attente.
 * @param users Client qui appelle user-service.
 * @returns Un objet offrant `deliver` (une demande) et `deliverDue` (toutes celles à retenter).
 */
export function createProfileDeliveryService(outbox: OutboxRepository, users: UsersClient) {
  /**
   * @brief Tente d'envoyer une demande à user-service et enregistre ce qui s'est passé.
   * @details Trois issues possibles. Succès : la demande est marquée envoyée et le compte activé.
   *   Refus définitif : le compte est marqué en échec. Toute autre erreur : l'échec est noté et un
   *   nouvel essai programmé. Cette fonction ne lève jamais d'erreur à cause de user-service : une
   *   panne de Users ne doit pas faire échouer l'inscription.
   * @param provision Demande à envoyer.
   * @returns `delivered`, `pending` s'il faudra réessayer, ou `permanent_failure` avec la raison.
   */
  async function deliver(provision: ProfileProvision): Promise<DeliveryResult> {
    try {
      await users.provisionProfile(provision)
      await outbox.markDelivered(provision)
      return { status: 'delivered' }
    } catch (error) {
      if (error instanceof PermanentProvisionError) {
        await outbox.markPermanentlyFailed(provision, error.code)
        return { status: 'permanent_failure', code: error.code }
      }
      await outbox.markAttemptFailed(provision, errorCodeOf(error))
      return { status: 'pending' }
    }
  }

  return {
    deliver,

    /**
     * @brief Retente les demandes dont l'heure du prochain essai est arrivée.
     * @param limit Nombre maximal de demandes à traiter en une fois.
     * @returns Les demandes qui restent en attente après ce passage.
     */
    async deliverDue(limit: number): Promise<ProfileProvision[]> {
      const stillPending: ProfileProvision[] = []
      for (const provision of await outbox.listDue(limit)) {
        const result = await deliver(provision)
        if (result.status === 'pending') {
          stillPending.push(provision)
        }
      }
      return stillPending
    },
  }
}
