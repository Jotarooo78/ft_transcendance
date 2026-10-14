/**
 * @file avatars.routes.ts
 * @brief Déclaration des trois routes d'avatar.
 */

import type { App } from '@ft/service-kit'
import type { AvatarsController } from '../controllers/avatars.controller.js'
import { FileNameParamsSchema, ProfileSchema } from '../schemas/profiles.schema.js'

/**
 * @brief Déclare l'envoi d'un avatar (`POST /me/avatar`, réservé à l'utilisateur connecté), sa
 *   suppression (`DELETE /me/avatar`, même protection) et la lecture d'un avatar
 *   (`GET /avatars/:fileName`, publique).
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param avatars Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerAvatarsRoutes(app: App, avatars: AvatarsController) {
  app.post(
    '/me/avatar',
    { onRequest: app.authenticate, schema: { response: { 200: ProfileSchema } } },
    avatars.upload
  )
  app.delete(
    '/me/avatar',
    { onRequest: app.authenticate, schema: { response: { 200: ProfileSchema } } },
    avatars.remove
  )
  app.get('/avatars/:fileName', { schema: { params: FileNameParamsSchema } }, avatars.show)
}
