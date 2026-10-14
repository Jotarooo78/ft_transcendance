/**
 * @file sessions.routes.ts
 * @brief Déclaration des routes de sessions d'écoute : à quelle URL répond quelle fonction.
 *
 * @details Un fichier de routes est la table des matières d'une partie du service. Pour chaque
 *   route il indique la méthode HTTP et le chemin, la protection d'accès, les schémas qui valident
 *   la requête et filtrent la réponse, et la fonction du contrôleur à appeler. Pour comprendre ce
 *   que fait une URL, pars d'ici.
 *
 * Rappel : Nginx retire le préfixe `/api/playback` avant de transmettre. Le navigateur appelle
 * `/api/playback/sessions`, ce service reçoit `/sessions`.
 */

import { PageQuerySchema, type App } from '@ft/service-kit'
import type { SessionsController } from '../controllers/sessions.controller.js'
import {
  OpenSessionBodySchema,
  ProgressBodySchema,
  SessionPageSchema,
  SessionParamsSchema,
  SessionSchema,
} from '../schemas/sessions.schema.js'

/**
 * @brief Déclare les quatre routes de sessions sur le serveur.
 * @details Toutes portent `onRequest: app.authenticate` : le jeton de connexion est vérifié dès
 *   l'arrivée de la requête, avant toute validation. Un visiteur non connecté reçoit `401` quelle
 *   que soit sa requête.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param sessions Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerSessionsRoutes(app: App, sessions: SessionsController) {
  const onRequest = app.authenticate
  const params = SessionParamsSchema

  app.post(
    '/sessions',
    { onRequest, schema: { body: OpenSessionBodySchema, response: { 201: SessionSchema } } },
    sessions.open
  )

  app.put(
    '/sessions/:id/progress',
    { onRequest, schema: { params, body: ProgressBodySchema, response: { 200: SessionSchema } } },
    sessions.progress
  )

  // Pas de schéma de corps : il peut être absent, ce que le contrôleur vérifie lui-même.
  app.post(
    '/sessions/:id/close',
    { onRequest, schema: { params, response: { 200: SessionSchema } } },
    sessions.close
  )

  app.get(
    '/sessions',
    { onRequest, schema: { querystring: PageQuerySchema, response: { 200: SessionPageSchema } } },
    sessions.history
  )
}
