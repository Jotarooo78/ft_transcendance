/**
 * @file internal.routes.ts
 * @brief Déclaration des routes réservées aux autres services.
 */

import type { App } from '@ft/service-kit'
import type { InternalController } from '../controllers/internal.controller.js'
import {
  FriendshipParamsSchema,
  FriendshipSchema,
  UserIdParamsSchema,
} from '../schemas/profiles.schema.js'

/**
 * @brief Déclare `PUT /internal/profiles/:userId` (appelée par auth-service) et `GET
 *   /internal/friendships/:userId/:otherId` (appelée par chat-service).
 * @details Elles portent `onRequest: app.requireInternalToken` : la requête doit présenter le secret
 *   partagé entre services, sinon elle est refusée avant tout traitement.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param internal Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerInternalRoutes(app: App, internal: InternalController) {
  app.put(
    '/internal/profiles/:userId',
    { onRequest: app.requireInternalToken, schema: { params: UserIdParamsSchema } },
    internal.provisionProfile
  )

  app.get(
    '/internal/friendships/:userId/:otherId',
    {
      onRequest: app.requireInternalToken,
      schema: { params: FriendshipParamsSchema, response: { 200: FriendshipSchema } },
    },
    internal.friendship
  )
}
