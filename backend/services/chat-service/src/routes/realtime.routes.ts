/**
 * @file realtime.routes.ts
 * @brief Déclaration des deux routes du temps réel : le ticket (REST) et le WebSocket.
 *
 * @details `POST /ws-ticket` est une route ordinaire, protégée par le jeton de connexion. `GET /ws`
 *   est la route WebSocket : l'option `websocket: true` dit à Fastify qu'une requête de « mise à
 *   niveau » (le passage de HTTP à WebSocket) est attendue. Elle n'est pas protégée par le jeton mais
 *   par le ticket, vérifié par `preHandler` **avant** l'ouverture de la connexion.
 *
 * Rappel : le navigateur appelle `/api/chat/ws`, Nginx transmet `/ws` à ce service.
 */

import type { App } from '@ft/service-kit'
import type { RealtimeController } from '../controllers/realtime.controller.js'
import { TicketSchema, WsQuerySchema } from '../schemas/conversations.schema.js'

/**
 * @brief Déclare le ticket et le WebSocket sur le serveur.
 * @param app Serveur Fastify sur lequel déclarer les routes ; le plugin `@fastify/websocket` doit
 *   avoir été enregistré avant (voir app.ts).
 * @param realtime Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerRealtimeRoutes(app: App, realtime: RealtimeController) {
  app.post(
    '/ws-ticket',
    { onRequest: app.authenticate, schema: { response: { 200: TicketSchema } } },
    realtime.issueTicket
  )

  app.get(
    '/ws',
    { websocket: true, schema: { querystring: WsQuerySchema }, preHandler: realtime.checkTicket },
    realtime.connect
  )
}
