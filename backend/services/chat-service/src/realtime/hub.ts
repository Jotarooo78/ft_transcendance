/**
 * @file hub.ts
 * @brief Le « hub » : le registre des connexions WebSocket ouvertes, et la diffusion d'événements aux
 *   comptes connectés.
 *
 * @details Un WebSocket est une connexion qui reste ouverte entre le navigateur et le serveur, dans
 *   laquelle le serveur peut envoyer un message à tout moment, sans que le navigateur le demande.
 *   C'est ce qui permet d'afficher un message dès qu'il arrive.
 *
 * Le hub garde en mémoire, pour chaque compte, l'ensemble de ses connexions (un compte peut avoir
 * plusieurs onglets ouverts). Quand un message est enregistré, le service demande au hub de
 * l'envoyer aux deux amis. Le hub ne stocke rien et ne décide de rien : si personne n'est connecté,
 * `publish` ne fait rien, et le destinataire retrouvera le message en lisant l'historique.
 *
 * Limite assumée : le registre est en mémoire, donc ce service ne doit tourner qu'en **une seule
 * instance**. Avec deux instances, un compte connecté à l'une ne recevrait pas les événements
 * produits par l'autre.
 */

import type { WebSocket } from 'ws'
import type { Message } from '../domain/message.js'

/** @brief Les trois événements que le serveur pousse aux clients ; `type` dit lequel c'est. */
export type ChatEvent =
  | { type: 'message.created'; conversationId: string; message: Message }
  | { type: 'message.deleted'; conversationId: string; messageId: number }
  | {
      type: 'conversation.read'
      conversationId: string
      byUserId: string
      lastReadMessageId: number
    }

/** @brief Le hub tel que les services le voient : trois opérations. */
export type Hub = {
  /** @brief Enregistre une connexion pour un compte. Renvoie faux (et ferme) s'il en a déjà trop. */
  register: (userId: string, socket: WebSocket) => boolean
  /** @brief Envoie un événement aux connexions ouvertes de ces comptes. N'échoue jamais. */
  publish: (userIds: string[], event: ChatEvent) => void
  /** @brief Ferme toutes les connexions et arrête le battement. Appelé à l'arrêt du serveur. */
  closeAll: () => void
}

/** @brief Réglages du hub, tous facultatifs. */
export type HubOptions = {
  /** @brief Nombre maximal de connexions simultanées pour un même compte. 5 par défaut. */
  maxPerUser?: number
  /** @brief Délai entre deux battements, en millisecondes. 30 secondes par défaut. */
  pingIntervalMs?: number
}

/** @brief Code de fermeture WebSocket « politique violée » ; utilisé quand un compte a trop de connexions. */
const policyViolation = 1008

/**
 * @brief Crée le hub.
 * @details Il lance un **battement** : toutes les `pingIntervalMs`, il envoie un `ping` (petit message
 *   de contrôle du protocole WebSocket, invisible pour l'application) à chaque connexion. Le
 *   navigateur répond automatiquement par un `pong`. Une connexion qui n'a pas répondu depuis le
 *   battement précédent est considérée morte et coupée. Sans cela, un onglet fermé brutalement
 *   (perte de réseau, batterie) resterait « connecté » indéfiniment. Ce battement est aussi ce qui
 *   empêche Nginx de couper une connexion simplement silencieuse.
 * @param options Nombre maximal de connexions par compte et délai du battement.
 * @returns Le hub.
 */
export function createHub({ maxPerUser = 5, pingIntervalMs = 30_000 }: HubOptions = {}): Hub {
  const sockets = new Map<string, Set<WebSocket>>()
  const alive = new WeakSet<WebSocket>()

  const heartbeat = setInterval(() => {
    for (const set of sockets.values()) {
      for (const socket of set) {
        if (!alive.has(socket)) {
          socket.terminate()
          continue
        }
        alive.delete(socket)
        socket.ping()
      }
    }
  }, pingIntervalMs)
  heartbeat.unref()

  return {
    register(userId, socket) {
      const set = sockets.get(userId) ?? new Set<WebSocket>()
      if (set.size >= maxPerUser) {
        socket.close(policyViolation, 'too many connections')
        return false
      }
      set.add(socket)
      sockets.set(userId, set)
      alive.add(socket)
      socket.on('pong', () => alive.add(socket))
      socket.on('error', () => socket.terminate())
      socket.on('close', () => {
        set.delete(socket)
        if (set.size === 0) {
          sockets.delete(userId)
        }
      })
      return true
    },

    publish(userIds, event) {
      const payload = JSON.stringify(event)
      for (const userId of new Set(userIds)) {
        for (const socket of sockets.get(userId) ?? []) {
          try {
            socket.send(payload)
          } catch {
            socket.terminate()
          }
        }
      }
    },

    closeAll() {
      clearInterval(heartbeat)
      for (const set of sockets.values()) {
        for (const socket of set) {
          socket.close()
        }
      }
      sockets.clear()
    },
  }
}
