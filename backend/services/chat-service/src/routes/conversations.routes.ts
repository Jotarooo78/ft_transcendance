/**
 * @file conversations.routes.ts
 * @brief Déclaration des routes de conversations : à quelle URL répond quelle fonction.
 *
 * @details Un fichier de routes est la table des matières d'une partie du service. Pour chaque route
 *   il indique la méthode HTTP et le chemin, la protection d'accès, les schémas qui valident la
 *   requête et filtrent la réponse, et la fonction du contrôleur à appeler. Pour comprendre ce que
 *   fait une URL, pars d'ici.
 *
 * Rappel : Nginx retire le préfixe `/api/chat` avant de transmettre. Le navigateur appelle
 * `/api/chat/conversations`, ce service reçoit `/conversations`.
 */

import { PageQuerySchema, type App } from '@ft/service-kit'
import type { ConversationsController } from '../controllers/conversations.controller.js'
import {
  ConversationPageSchema,
  ConversationSchema,
  OpenConversationBodySchema,
  UnreadSchema,
} from '../schemas/conversations.schema.js'

/**
 * @brief Déclare les trois routes de conversations sur le serveur.
 * @details Toutes portent `onRequest: app.authenticate` : le jeton de connexion est vérifié dès
 *   l'arrivée de la requête, avant toute validation. Un visiteur non connecté reçoit `401` quelle que
 *   soit sa requête.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param conversations Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerConversationsRoutes(app: App, conversations: ConversationsController) {
  const onRequest = app.authenticate

  app.get(
    '/conversations',
    {
      onRequest,
      schema: { querystring: PageQuerySchema, response: { 200: ConversationPageSchema } },
    },
    conversations.list
  )

  app.post(
    '/conversations',
    {
      onRequest,
      schema: {
        body: OpenConversationBodySchema,
        response: { 200: ConversationSchema, 201: ConversationSchema },
      },
    },
    conversations.open
  )

  app.get(
    '/unread',
    { onRequest, schema: { response: { 200: UnreadSchema } } },
    conversations.unread
  )
}
