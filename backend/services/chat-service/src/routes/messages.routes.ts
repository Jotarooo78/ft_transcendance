/**
 * @file messages.routes.ts
 * @brief Déclaration des routes de messages : à quelle URL répond quelle fonction.
 *
 * @details Même principe que conversations.routes.ts. Toutes ces routes sont privées.
 */

import type { App } from '@ft/service-kit'
import type { MessagesController } from '../controllers/messages.controller.js'
import {
  ConversationParamsSchema,
  HistoryQuerySchema,
  MessageParamsSchema,
  MessagePageSchema,
  MessageSchema,
  ReadBodySchema,
  ReadResultSchema,
  SendMessageBodySchema,
} from '../schemas/messages.schema.js'

/**
 * @brief Déclare les quatre routes de messages sur le serveur.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param messages Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerMessagesRoutes(app: App, messages: MessagesController) {
  const onRequest = app.authenticate
  const params = ConversationParamsSchema

  app.get(
    '/conversations/:id/messages',
    {
      onRequest,
      schema: { params, querystring: HistoryQuerySchema, response: { 200: MessagePageSchema } },
    },
    messages.history
  )

  app.post(
    '/conversations/:id/messages',
    {
      onRequest,
      schema: { params, body: SendMessageBodySchema, response: { 201: MessageSchema } },
    },
    messages.send
  )

  app.delete(
    '/conversations/:id/messages/:messageId',
    { onRequest, schema: { params: MessageParamsSchema, response: { 200: MessageSchema } } },
    messages.remove
  )

  app.post(
    '/conversations/:id/read',
    {
      onRequest,
      schema: { params, body: ReadBodySchema, response: { 200: ReadResultSchema } },
    },
    messages.markRead
  )
}
