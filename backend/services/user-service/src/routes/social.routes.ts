/**
 * @file social.routes.ts
 * @brief Déclaration des routes d'amis et de présence en ligne.
 */

import type { App } from '@ft/service-kit'
import type { SocialController } from '../controllers/social.controller.js'
import { FriendIdParamsSchema, UserIdParamsSchema } from '../schemas/profiles.schema.js'

/**
 * @brief Déclare les six routes sur le serveur.
 * @details Toutes exigent un jeton de connexion, sauf `GET /presence/:userId`, qui est publique.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param social Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerSocialRoutes(app: App, social: SocialController) {
  const onRequest = app.authenticate
  const friend = { params: FriendIdParamsSchema }

  app.get('/friends', { onRequest }, social.friends)
  app.post('/friends/:friendId', { onRequest, schema: friend }, social.addFriend)
  app.delete('/friends/:friendId', { onRequest, schema: friend }, social.removeFriend)

  app.post('/presence/heartbeat', { onRequest }, social.heartbeat)
  app.post('/presence/offline', { onRequest }, social.goOffline)
  app.get('/presence/:userId', { schema: { params: UserIdParamsSchema } }, social.presence)
}
