/**
 * @file sessions.service.ts
 * @brief Règles métier des sessions d'écoute : ouvrir, faire avancer, fermer, lister l'historique.
 *
 * @details Un service est la couche qui décide. Il reçoit une demande dont la forme a déjà été
 *   vérifiée, applique les règles du métier et dit quoi répondre. Il ne connaît ni HTTP (rôle du
 *   contrôleur) ni SQL (rôle du repository). Ici, il enchaîne surtout les autres pièces : le client
 *   du catalogue, le repository et les règles de domain/progress.ts.
 *
 * Règle de sécurité valable pour tout ce fichier : l'identifiant du compte (`owner`) vient toujours
 * du jeton de connexion vérifié, jamais d'une donnée envoyée par le client.
 */

import type { Pagination } from '@ft/service-kit'
import type { CatalogClient } from '../clients/catalog.client.js'
import { trackNotFound } from '../domain/errors.js'
import { recordClose, recordProgress, type Progress } from '../domain/progress.js'
import { toHistorySession, toSession, type Session } from '../domain/session.js'
import type { SessionsRepository } from '../repositories/sessions.repository.js'

/**
 * @brief Type de l'objet renvoyé par `createSessionsService`, c'est-à-dire la liste de ses
 *   opérations. Le contrôleur s'en sert pour déclarer ce dont il a besoin.
 */
export type SessionsService = ReturnType<typeof createSessionsService>
/**
 * @brief Une page de l'historique telle que le client la reçoit : les sessions, leur nombre total,
 *   le numéro de page et la taille de page.
 */
export type SessionPage = Pagination & { total: number; items: Session[] }

/**
 * @brief Crée le service des sessions.
 * @param sessions Repository qui lit et écrit les sessions.
 * @param catalog Client qui interroge le catalogue.
 * @returns Un objet offrant `open`, `progress`, `close` et `history`.
 */
export function createSessionsService(sessions: SessionsRepository, catalog: CatalogClient) {
  return {
    /**
     * @brief Ouvre une session d'écoute sur un morceau.
     * @details Le catalogue est interrogé d'abord : on n'ouvre de session que sur un morceau
     *   publié, et on a besoin de sa durée.
     * @param owner Identifiant du compte connecté.
     * @param trackId Identifiant du morceau à écouter.
     * @returns La session ouverte, à la position 0 et sans temps écouté.
     * @throws {DomainError} `404 track_not_found` si le morceau est inconnu ou non publié.
     */
    async open(owner: string, trackId: string): Promise<Session> {
      const durationMs = await catalog.readTrackDuration(trackId)
      if (durationMs === null) {
        throw trackNotFound()
      }
      if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
        throw new Error('Invalid track duration')
      }
      return toSession(await sessions.create(owner, trackId, durationMs))
    },

    /**
     * @brief Enregistre un événement de progression sur une session.
     * @details Réserve la session puis applique `recordProgress` (domain/progress.ts).
     * @param owner Identifiant du compte connecté.
     * @param id Identifiant de la session.
     * @param input Événement reçu du lecteur.
     * @returns La session à jour.
     * @throws {DomainError} `404 session_not_found`, `409 progress_conflict` ou `400
     *   invalid_request`.
     */
    progress(owner: string, id: string, input: Progress): Promise<Session> {
      return sessions.withLock(owner, id, (tx) => recordProgress(tx, input))
    },

    /**
     * @brief Ferme une session d'écoute.
     * @details Réserve la session puis applique `recordClose` (domain/progress.ts).
     * @param owner Identifiant du compte connecté.
     * @param id Identifiant de la session.
     * @returns La session fermée.
     * @throws {DomainError} `404 session_not_found`.
     */
    close(owner: string, id: string): Promise<Session> {
      return sessions.withLock(owner, id, (tx) => recordClose(tx))
    },

    /**
     * @brief Renvoie une page de l'historique d'écoute du compte.
     * @param owner Identifiant du compte connecté.
     * @param pagination Numéro de page et nombre de sessions par page.
     * @returns La page de sessions, de la plus récente à la plus ancienne.
     */
    async history(owner: string, pagination: Pagination): Promise<SessionPage> {
      const { rows, total } = await sessions.history(owner, pagination)
      return { ...pagination, total, items: rows.map(toHistorySession) }
    },
  }
}
