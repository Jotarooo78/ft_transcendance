/** Routes authentifiées des ajouts multiples, déplacements, retraits annulables et copies. */
import type { App } from '@ft/service-kit'
import { PlaylistParamsSchema, PlaylistSchema } from '../schemas/playlists.schema.js'
import {
  PlaylistActionSchema,
  DuplicatePlaylistSchema,
} from '../schemas/playlist-actions.schema.js'
import type { createPlaylistActionsService } from '../services/playlist-actions.service.js'
/** Les schémas filtrent les réponses et bornent les commandes avant leur traitement. */
export function registerPlaylistActionsRoutes(
  app: App,
  service: ReturnType<typeof createPlaylistActionsService>
) {
  app.post(
    '/playlists/:id/actions',
    {
      onRequest: app.authenticate,
      schema: {
        params: PlaylistParamsSchema,
        body: PlaylistActionSchema,
        response: { 200: PlaylistSchema },
      },
    },
    async (request) => service.change(request.userId, request.params.id, request.body)
  )
  app.post(
    '/playlists/:id/duplicate',
    {
      onRequest: app.authenticate,
      schema: {
        params: PlaylistParamsSchema,
        body: DuplicatePlaylistSchema,
        response: { 200: PlaylistSchema },
      },
    },
    async (request) =>
      service.duplicate(
        request.userId,
        request.params.id,
        request.body.targetId,
        request.body.expectedVersion
      )
  )
}
