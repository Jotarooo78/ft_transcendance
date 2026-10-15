/** Routes d’envoi, réservation interne et lecture publique des images de playlist. */
import { Type } from 'typebox'
import { UuidSchema, type App } from '@ft/service-kit'
import { receiveSingleFile } from '../controllers/receive-upload.js'
import { sendFile } from '../controllers/send-file.js'
import { imageByteLimit } from '../domain/limits.js'
import { uploadBusy } from '../domain/errors.js'
import type { UploadGate } from '../services/upload-gate.js'
import type { PlaylistImagesService } from '../services/playlist-images.service.js'
/** Partage la limite d’envoi avec l’audio ; les lectures ne mettent pas la visibilité en cache. */
export function registerPlaylistImagesRoutes(
  app: App,
  images: PlaylistImagesService,
  gate: UploadGate
) {
  app.post('/playlist-images', { onRequest: app.authenticate }, async (request, reply) => {
    if (!gate.tryEnter()) throw uploadBusy()
    const controller = new AbortController()
    /** Interrompt le décodeur si l’envoi est abandonné. */
    const abort = () => {
      if (!reply.raw.writableEnded) controller.abort()
    }
    request.raw.on('aborted', abort)
    reply.raw.on('close', abort)
    try {
      return await images.upload(
        request.userId,
        (path) => receiveSingleFile(request, path, controller.signal, imageByteLimit),
        controller.signal
      )
    } finally {
      gate.leave()
      request.raw.off('aborted', abort)
      reply.raw.off('close', abort)
    }
  })
  app.put(
    '/internal/playlist-images/:id/reservation',
    {
      onRequest: app.requireInternalToken,
      schema: {
        params: Type.Object({ id: UuidSchema }),
        body: Type.Object(
          { owner: UuidSchema, playlistId: UuidSchema },
          { additionalProperties: false }
        ),
      },
    },
    (request) => images.reserve(request.params.id, request.body.owner, request.body.playlistId)
  )
  app.route({
    method: ['GET', 'HEAD'],
    url: '/playlists/:id/artwork',
    schema: { params: Type.Object({ id: UuidSchema }) },
    handler: async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff')
      return sendFile(request, reply, await images.open(request.params.id))
    },
  })
}
