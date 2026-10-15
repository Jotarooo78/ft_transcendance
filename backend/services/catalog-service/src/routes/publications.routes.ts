/** Déclaration de la publication ; le domaine valide les champs éditables. */
import type { App } from '@ft/service-kit'
import type { createPublicationsController } from '../controllers/publications.controller.js'
import { TrackSchema } from '../schemas/tracks.schema.js'
/** Le schéma de réponse conserve identité, description et liens de pochette. */
export function registerPublicationsRoutes(
  app: App,
  controller: ReturnType<typeof createPublicationsController>
) {
  app.post('/tracks', { schema: { response: { 201: TrackSchema } } }, controller)
}
