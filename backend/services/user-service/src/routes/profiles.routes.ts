/**
 * @file profiles.routes.ts
 * @brief Déclaration des routes de profil : à quelle URL répond quelle fonction.
 *
 * @details Un fichier de routes est la table des matières d'une partie du service. Pour chaque
 *   route il indique la méthode HTTP et le chemin, la protection d'accès, les schémas, et la
 *   fonction du contrôleur à appeler. Pour comprendre ce que fait une URL, pars d'ici.
 *
 * Rappel : Nginx retire le préfixe `/api/users` avant de transmettre. Le navigateur appelle
 * `/api/users/me`, ce service reçoit `/me`.
 */

import type { App } from '@ft/service-kit'
import type { ProfilesController } from '../controllers/profiles.controller.js'
import {
  ProfileSchema,
  PublicProfileSchema,
  UserIdParamsSchema,
} from '../schemas/profiles.schema.js'

// Les corps sont validés dans domain/ : leurs messages d'erreur font partie du contrat.

/**
 * @brief Déclare les quatre routes de profil sur le serveur.
 * @details `/me`, `/me/profile` et `/profiles` exigent un jeton de connexion (`onRequest:
 *   app.authenticate`). `/profile/:userId` est publique.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param profiles Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerProfilesRoutes(app: App, profiles: ProfilesController) {
  const onRequest = app.authenticate
  const response = { 200: ProfileSchema }

  app.get(
    '/profiles/:userId',
    { schema: { params: UserIdParamsSchema, response } },
    profiles.artist
  )
  app.get('/me', { onRequest, schema: { response } }, profiles.me)
  app.put('/me/profile', { onRequest, schema: { response } }, profiles.update)
  app.get('/profiles', { onRequest }, profiles.directory)
  app.get(
    '/profile/:userId',
    { schema: { params: UserIdParamsSchema, response: { 200: PublicProfileSchema } } },
    profiles.show
  )
}
