/**
 * @file audio.routes.ts
 * @brief Déclaration de la route d'écoute publique d'un morceau.
 *
 * @details Rappel : Nginx retire le préfixe `/api/media` avant de transmettre. Le navigateur
 *   appelle `/api/media/assets/<id>/audio`, ce service reçoit `/assets/<id>/audio`.
 */

import { noStore, type App } from '@ft/service-kit'
import type { AudioController } from '../controllers/audio.controller.js'
import { FileParamsSchema } from '../schemas/files.schema.js'
import { refuseWith } from './refusals.js'

/**
 * @brief Déclare `GET` et `HEAD /assets/:id/audio`.
 * @details Cette route n'exige pas de jeton de connexion : tout visiteur peut écouter un morceau
 *   publié.
 * @param app Serveur Fastify sur lequel déclarer la route.
 * @param audio Contrôleur dont la fonction répond à cette route.
 */
export function registerAudioRoutes(app: App, audio: AudioController) {
  app.route({
    method: ['GET', 'HEAD'],
    url: '/assets/:id/audio',
    onRequest: noStore,
    schema: { params: FileParamsSchema },
    errorHandler: refuseWith({ fallback: { status: 503, code: 'media_unavailable' } }),
    handler: audio.stream,
  })
}
