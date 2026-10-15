/** Déclare la réservation interne, protégée par le secret partagé et bloquée dans Nginx. */
import { UuidSchema, type App } from '@ft/service-kit'
import { Type } from 'typebox'
import type { createPublicationsController } from '../controllers/publications.controller.js'
/** Installe uniquement une opération interne, sans identité fournie par le navigateur. */
export function registerPublicationsRoutes(
  app: App,
  controller: ReturnType<typeof createPublicationsController>
) {
  app.put(
    '/internal/assets/:id/publication',
    {
      onRequest: app.requireInternalToken,
      schema: {
        params: Type.Object({ id: UuidSchema }),
        body: Type.Object({ ownerId: UuidSchema }, { additionalProperties: false }),
      },
    },
    controller.reserve
  )
}
