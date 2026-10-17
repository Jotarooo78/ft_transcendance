/**
 * @file tickets.service.ts
 * @brief Émission et consommation des tickets de connexion WebSocket.
 *
 * @details Un navigateur ne peut pas ajouter d'en-tête `Authorization` à une connexion WebSocket, et
 *   on ne veut pas mettre le jeton de connexion (valable une heure) dans l'adresse, où il serait
 *   écrit dans les journaux. On procède donc en deux temps : le client, connecté par le REST
 *   ordinaire, demande un **ticket** ; puis il ouvre le WebSocket en présentant ce ticket.
 *
 * Un ticket est une suite aléatoire et imprévisible, associée à un compte, valable 30 secondes et
 * **une seule fois**. Comme il est à usage unique et expire vite, le voir dans un journal d'accès ne
 * donne aucun pouvoir à quelqu'un qui le lirait plus tard.
 *
 * Les tickets sont gardés en mémoire : comme le hub, cela suppose une seule instance du service.
 */

import { randomBytes } from 'node:crypto'
import { chatUnavailable } from '../domain/errors.js'

/** @brief Type de l'objet renvoyé par `createTicketsService` : ses opérations. */
export type TicketsService = ReturnType<typeof createTicketsService>

/** @brief Réglages du service de tickets, tous facultatifs (ils servent surtout aux tests). */
export type TicketsOptions = {
  /** @brief Fonction qui donne l'heure en millisecondes. Les tests la remplacent pour avancer le temps. */
  now?: () => number
  /** @brief Durée de validité d'un ticket, en millisecondes. 30 secondes par défaut. */
  ttlMs?: number
  /** @brief Nombre maximal de tickets en attente. 10 000 par défaut. */
  maxTickets?: number
}

/**
 * @brief Crée le service de tickets.
 * @param options Horloge, durée de validité et plafond.
 * @returns Un objet offrant `issue`, `consume` et `ttlSeconds`.
 */
export function createTicketsService({
  now = Date.now,
  ttlMs = 30_000,
  maxTickets = 10_000,
}: TicketsOptions = {}) {
  const tickets = new Map<string, { userId: string; expiresAt: number }>()

  return {
    /** @brief Durée de validité d'un ticket, en secondes, telle qu'on l'annonce au client. */
    ttlSeconds: Math.floor(ttlMs / 1000),

    /**
     * @brief Émet un ticket pour un compte.
     * @details Les tickets expirés sont retirés au passage : sans cela, la table grossirait
     *   indéfiniment. Le ticket vient de `randomBytes` (aléa cryptographique) et jamais de
     *   `Math.random()`, qui est prévisible.
     * @param userId Identifiant du compte connecté, lu dans son jeton.
     * @returns Le ticket, sous forme de texte.
     * @throws {DomainError} 503 `chat_unavailable` si trop de tickets sont déjà en attente.
     */
    issue(userId: string): string {
      const current = now()
      for (const [ticket, entry] of tickets) {
        if (entry.expiresAt <= current) {
          tickets.delete(ticket)
        }
      }
      if (tickets.size >= maxTickets) {
        throw chatUnavailable()
      }
      const ticket = randomBytes(32).toString('base64url')
      tickets.set(ticket, { userId, expiresAt: current + ttlMs })
      return ticket
    },

    /**
     * @brief Utilise un ticket : il est retiré, donc il ne servira plus jamais.
     * @details Le ticket est retiré **avant** de tester sa date, pour qu'un ticket expiré disparaisse
     *   aussi.
     * @param ticket Ticket présenté par le client.
     * @returns L'identifiant du compte, ou null si le ticket est inconnu, déjà utilisé ou expiré.
     */
    consume(ticket: string): string | null {
      const entry = tickets.get(ticket)
      tickets.delete(ticket)
      return entry && entry.expiresAt > now() ? entry.userId : null
    },
  }
}
