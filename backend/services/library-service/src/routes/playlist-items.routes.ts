/**
 * @file playlist-items.routes.ts
 * @brief Déclaration des deux routes qui ajoutent et retirent un morceau dans une playlist.
 */

import type { App } from '@ft/service-kit'
import type { PlaylistItemsController } from '../controllers/playlist-items.controller.js'
import {
  AddItemBodySchema,
  PlaylistItemParamsSchema,
  PlaylistParamsSchema,
  PlaylistSchema,
  VersionBodySchema,
} from '../schemas/playlists.schema.js'

/**
 * @brief Déclare les deux routes sur le serveur.
 * @details Comme toutes les routes du service, elles exigent un jeton de connexion valide. Les deux
 *   renvoient la playlist à jour, ce qui évite au client de la redemander.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param items Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerPlaylistItemsRoutes(app: App, items: PlaylistItemsController) {
  const onRequest = app.authenticate
  const response = { 200: PlaylistSchema }

  app.post(
    '/playlists/:id/items',
    { onRequest, schema: { params: PlaylistParamsSchema, body: AddItemBodySchema, response } },
    items.add
  )

  app.delete(
    '/playlists/:id/items/:itemId',
    {
      onRequest,
      schema: { params: PlaylistItemParamsSchema, body: VersionBodySchema, response },
    },
    items.remove
  )
}
