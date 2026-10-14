/**
 * @file tracks.routes.ts
 * @brief Déclaration des routes publiques de morceaux : à quelle URL répond quelle fonction.
 *
 * @details Un fichier de routes est la table des matières d'une partie du service. Pour chaque
 *   route, il indique la méthode HTTP et le chemin, les schémas qui valident la requête et filtrent
 *   la réponse, et la fonction du contrôleur à appeler. Il ne contient aucune logique. Pour
 *   comprendre ce que fait une URL, pars d'ici puis suis la fonction du contrôleur.
 *
 * Rappel : Nginx retire le préfixe `/api/catalog` avant de transmettre. Le navigateur appelle
 * `/api/catalog/tracks`, ce service reçoit `/tracks`.
 */

import type { App } from '@ft/service-kit'
import type { TracksController } from '../controllers/tracks.controller.js'
import {
  TrackPageSchema,
  TrackParamsSchema,
  TrackQuerySchema,
  TrackSchema,
} from '../schemas/tracks.schema.js'

/**
 * @brief Déclare les deux routes de morceaux sur le serveur.
 * @details `GET /tracks` renvoie une page de morceaux ; `GET /tracks/:id` renvoie un morceau. Les
 *   deux sont publiques : aucune connexion n'est demandée pour consulter le catalogue.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param tracks Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerTracksRoutes(app: App, tracks: TracksController) {
  app.get(
    '/tracks',
    { schema: { querystring: TrackQuerySchema, response: { 200: TrackPageSchema } } },
    tracks.list
  )

  app.get(
    '/tracks/:id',
    { schema: { params: TrackParamsSchema, response: { 200: TrackSchema } } },
    tracks.show
  )
}
