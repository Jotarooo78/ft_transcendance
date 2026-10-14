/**
 * @file outbox.worker.ts
 * @brief Tâche de fond qui renvoie à user-service les demandes de création de profil qui n'ont pas
 *   abouti.
 *
 * @details Un « worker » est un morceau de code qui s'exécute tout seul à intervalle régulier, sans
 *   être déclenché par une requête HTTP. Celui-ci se réveille toutes les 2 secondes, lit les
 *   demandes en attente dont l'heure d'essai est arrivée, et tente de les envoyer.
 *
 * Son utilité : si user-service est en panne au moment d'une inscription, le compte reste « en
 * attente de profil ». Dès que user-service revient, ce worker termine l'inscription sans que
 * l'utilisateur ait à recommencer.
 */

import type { FastifyBaseLogger } from 'fastify'
import type { ProfileDeliveryService } from '../services/profile-delivery.service.js'

/**
 * @brief Réglages de la tâche : le service d'envoi, le journal où écrire les erreurs, l'intervalle
 *   entre deux passages et le nombre de demandes traitées par passage.
 */
type Options = {
  /** @brief Service qui livre les demandes. */
  delivery: ProfileDeliveryService
  /** @brief Journal du service. */
  log: FastifyBaseLogger
  /** @brief Délai entre deux passes, en millisecondes ; 2000 par défaut. */
  intervalMs?: number
  /** @brief Nombre maximal de demandes par passe ; 20 par défaut. */
  batchSize?: number
}

/**
 * @brief Crée la tâche de fond.
 * @param options Service d'envoi, journal, intervalle (2 secondes par défaut) et nombre de demandes
 *   par passage (20 par défaut).
 * @returns Un objet offrant `start`, `stop` et `runOnce`.
 */
export function createOutboxWorker({ delivery, log, intervalMs = 2000, batchSize = 20 }: Options) {
  let running = false
  let timer: NodeJS.Timeout | undefined

  /**
   * @brief Effectue un passage : envoie les demandes arrivées à échéance.
   * @details Si le passage précédent n'est pas terminé, celui-ci ne fait rien, pour ne pas envoyer
   *   deux fois la même demande. Une erreur est écrite dans le journal mais n'arrête pas les
   *   passages suivants.
   */
  async function runOnce(): Promise<void> {
    if (running) {
      return
    }
    running = true
    try {
      for (const { eventId, userId } of await delivery.deliverDue(batchSize)) {
        log.warn({ eventId, userId }, 'profile provision will be retried')
      }
    } catch (error) {
      log.error({ err: error }, 'profile provision worker failed')
    } finally {
      running = false
    }
  }

  return {
    runOnce,

    /**
     * @brief Démarre la tâche : un premier passage tout de suite, puis un passage à chaque
     *   intervalle.
     */
    start(): void {
      timer = setInterval(() => void runOnce(), intervalMs)
      void runOnce()
    },

    /** @brief Arrête la tâche. Appelée à la fermeture du serveur. */
    stop(): void {
      clearInterval(timer)
    },
  }
}
