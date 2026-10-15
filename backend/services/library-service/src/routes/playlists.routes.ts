/**
 * @file playlists.routes.ts
 * @brief Déclaration des routes de playlists : à quelle URL répond quelle fonction.
 *
 * @details Un fichier de routes est la table des matières d'une partie du service. Pour chaque
 *   route il indique la méthode HTTP et le chemin, la protection d'accès, les schémas qui valident
 *   la requête et filtrent la réponse, et la fonction du contrôleur à appeler. Pour comprendre ce
 *   que fait une URL, pars d'ici.
 *
 * Rappel : Nginx retire le préfixe `/api/library` avant de transmettre. Le navigateur appelle
 * `/api/library/playlists`, ce service reçoit `/playlists`.
 */

import { PageQuerySchema, noStore, type App } from '@ft/service-kit'
import type { PlaylistsController } from '../controllers/playlists.controller.js'
import {
  CreatePlaylistBodySchema,
  EditPlaylistBodySchema,
  PlaylistPageSchema,
  PlaylistParamsSchema,
  PlaylistSchema,
  VersionBodySchema,
} from '../schemas/playlists.schema.js'

/**
 * @brief Déclare les cinq routes de playlists sur le serveur.
 * @details Les routes personnelles portent `onRequest: app.authenticate` : le jeton est vérifié dès
 *   l'arrivée de la requête, avant toute validation. Un visiteur non connecté reçoit `401` quelle
 *   que soit sa requête.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param playlists Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerPlaylistsRoutes(app: App, playlists: PlaylistsController) {
  app.get(
    '/public/playlists/:id',
    {
      onRequest: noStore,
      schema: { params: PlaylistParamsSchema, response: { 200: PlaylistSchema } },
    },
    playlists.publicShow
  )
  const onRequest = [noStore, app.authenticate]
  const params = PlaylistParamsSchema

  app.get(
    '/playlists',
    { onRequest, schema: { querystring: PageQuerySchema, response: { 200: PlaylistPageSchema } } },
    playlists.list
  )

  app.get(
    '/playlists/:id',
    { onRequest, schema: { params, response: { 200: PlaylistSchema } } },
    playlists.show
  )

  app.post(
    '/playlists',
    { onRequest, schema: { body: CreatePlaylistBodySchema, response: { 201: PlaylistSchema } } },
    playlists.create
  )

  app.patch(
    '/playlists/:id',
    {
      onRequest,
      schema: { params, body: EditPlaylistBodySchema, response: { 200: PlaylistSchema } },
    },
    playlists.update
  )

  app.delete(
    '/playlists/:id',
    { onRequest, schema: { params, body: VersionBodySchema } },
    playlists.remove
  )
}
