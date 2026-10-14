/**
 * @file auth.routes.ts
 * @brief Déclaration des routes d'authentification : à quelle URL répond quelle fonction.
 *
 * @details Un fichier de routes est la table des matières du service. Pour comprendre ce que fait
 *   une URL, pars d'ici. Rappel : Nginx retire le préfixe `/api/auth` avant de transmettre. Le
 *   navigateur appelle `/api/auth/login`, ce service reçoit `/login`.
 */

import type { App } from '@ft/service-kit'
import type { RateLimits } from '../config/env.js'
import type { AuthController } from '../controllers/auth.controller.js'

// Les corps sont validés dans domain/credentials.ts : leurs messages font partie du contrat.

/**
 * @brief Fabrique le réglage de limitation d'une route.
 * @param max Nombre de requêtes acceptées par minute, ou rien pour ne pas limiter.
 * @returns Les options à passer à la route ; un objet vide s'il n'y a pas de limite.
 */
const perMinute = (max: number | undefined) =>
  max === undefined ? {} : { config: { rateLimit: { max, timeWindow: '1 minute' } } }

/**
 * @brief Déclare les trois routes `/signup`, `/login` et `/verify` sur le serveur.
 * @details Aucune n'exige de jeton : on les appelle justement pour en obtenir un ou en vérifier un.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param auth Contrôleur dont les fonctions répondent à ces routes.
 * @param limits Limites de requêtes par minute pour l'inscription et la connexion.
 */
export function registerAuthRoutes(app: App, auth: AuthController, limits: RateLimits) {
  app.post('/signup', perMinute(limits.signupPerMinute), auth.signup)
  app.post('/login', perMinute(limits.loginPerMinute), auth.login)
  app.post('/verify', auth.verify)
}
