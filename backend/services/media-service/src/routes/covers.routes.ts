/** Routes de pochette : trois privées, une lecture publique conditionnée par la publication. */
import type { App } from '@ft/service-kit'
import type { createCoversController } from '../controllers/covers.controller.js'
import { FileParamsSchema } from '../schemas/files.schema.js'
import { refuseWith } from './refusals.js'
/** Branche les contrôleurs avec des paramètres UUID et les refus communs de Media. */
export function registerCoversRoutes(
  app: App,
  controller: ReturnType<typeof createCoversController>
) {
  const options = {
    schema: { params: FileParamsSchema },
    errorHandler: refuseWith({ fallback: { status: 503, code: 'cover_unavailable' } }),
  }
  const privateOptions = { ...options, onRequest: app.authenticate }
  app.put('/assets/:id/cover', privateOptions, controller.replace)
  app.delete('/assets/:id/cover', privateOptions, controller.remove)
  app.route({
    method: ['GET', 'HEAD'],
    url: '/assets/:id/cover',
    ...privateOptions,
    handler: controller.privateRead,
  })
  app.route({
    method: ['GET', 'HEAD'],
    url: '/assets/:id/artwork',
    ...options,
    handler: controller.publicRead,
  })
}
