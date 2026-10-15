/** Modification de pochette réservée au propriétaire et contrôle interne pour le nettoyage Media. */
import { Type } from 'typebox'
import { UuidSchema, type App } from '@ft/service-kit'
import { PlaylistParamsSchema, PlaylistSchema } from '../schemas/playlists.schema.js'
import type { createPlaylistArtworkService } from '../services/playlist-artwork.service.js'
/** La visibilité publique ne donne jamais le droit de remplacer une image. */
export function registerPlaylistArtworkRoutes(
  app: App,
  artwork: ReturnType<typeof createPlaylistArtworkService>
) {
  app.put(
    '/playlists/:id/artwork',
    {
      onRequest: app.authenticate,
      schema: {
        params: PlaylistParamsSchema,
        body: Type.Object(
          {
            assetId: Type.Union([UuidSchema, Type.Null()]),
            expectedVersion: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
          },
          { additionalProperties: false }
        ),
        response: { 200: PlaylistSchema },
      },
    },
    (request) =>
      artwork.set(
        {
          owner: request.userId,
          id: request.params.id,
          expectedVersion: request.body.expectedVersion,
        },
        request.body.assetId
      )
  )
  app.get(
    '/internal/playlist-images/:id/reference',
    { onRequest: app.requireInternalToken, schema: { params: PlaylistParamsSchema } },
    async (request) => ({ referenced: await artwork.referenced(request.params.id) })
  )
}
