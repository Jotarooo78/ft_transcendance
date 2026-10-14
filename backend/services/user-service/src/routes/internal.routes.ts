/**
 * @file internal.routes.ts
 * @brief Déclaration de la route réservée à auth-service.
 */

import type { App } from '@ft/service-kit'
import type { InternalController } from '../controllers/internal.controller.js'
import { UserIdParamsSchema } from '../schemas/profiles.schema.js'

/**
 * @brief Déclare `PUT /internal/profiles/:userId`.
 * @details Elle porte `onRequest: app.requireInternalToken` : la requête doit présenter le secret
 *   partagé entre services, sinon elle est refusée avant tout traitement.
 * @param app Serveur Fastify sur lequel déclarer la route.
 * @param internal Contrôleur dont la fonction répond à cette route.
 */
export function registerInternalRoutes(app: App, internal: InternalController) {
  app.put(
    '/internal/profiles/:userId',
    { onRequest: app.requireInternalToken, schema: { params: UserIdParamsSchema } },
    internal.provisionProfile
  )
}
