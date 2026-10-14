/**
 * @file auth.controller.ts
 * @brief Contrôleur de l'authentification : relie les requêtes d'inscription, de connexion et de
 *   vérification de jeton aux services qui savent y répondre.
 *
 * @details Un contrôleur est la couche qui parle HTTP. Il lit le corps de la requête, le fait
 *   vérifier par les fonctions de domain/credentials.ts, appelle le service, puis choisit le statut
 *   HTTP de la réponse. Les fonctions sont rattachées à leurs URL dans routes/auth.routes.ts.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { toLoginInput, toSignupInput } from '../domain/credentials.js'
import type { LoginService } from '../services/login.service.js'
import type { SignupService } from '../services/signup.service.js'

/** @brief Type de l'objet renvoyé par `createAuthController` : une fonction par route. */
export type AuthController = ReturnType<typeof createAuthController>

/**
 * @brief Corps de la réponse quand le profil du compte n'est pas encore créé.
 * @details Il indique au frontend de réessayer dans 3 secondes (`retryAfterSeconds`).
 */
const pending = { status: 'pending', code: 'REGISTRATION_PENDING', retryAfterSeconds: 3 }

/**
 * @brief Crée le contrôleur de l'authentification.
 * @param signups Service d'inscription.
 * @param logins Service de connexion.
 * @returns Un objet contenant une fonction par route.
 */
export function createAuthController(signups: SignupService, logins: LoginService) {
  return {
    /**
     * @brief Répond à `POST /signup` : crée un compte.
     * @param request Requête reçue ; le corps contient l'email, le mot de passe, le username et le
     *   nom affiché.
     * @param reply Réponse : statut 201 si le compte est utilisable, 202 (« accepté, pas encore
     *   terminé ») si son profil est encore en cours de création.
     */
    async signup(request: FastifyRequest, reply: FastifyReply) {
      const result = await signups.signup(toSignupInput(request.body))
      if (result.status === 'pending') {
        return reply.code(202).send({ ...pending, nextAction: 'login' })
      }
      const { status, userId } = result
      return reply.code(201).send({ status, userId, nextAction: 'login' })
    },

    /**
     * @brief Répond à `POST /login` : connecte un utilisateur.
     * @param request Requête reçue ; le corps contient l'email et le mot de passe.
     * @param reply Réponse : statut 200 avec `{ token }`, ou 202 si le profil du compte est encore
     *   en cours de création.
     */
    async login(request: FastifyRequest, reply: FastifyReply) {
      const result = await logins.login(toLoginInput(request.body))
      if (result.status === 'pending') {
        return reply.code(202).send(pending)
      }
      return { token: result.token }
    },

    /**
     * @brief Répond à `POST /verify` : dit si un jeton de connexion est valide.
     * @param request Requête portant le jeton dans l'en-tête `Authorization: Bearer <jeton>`.
     * @param reply Réponse : `{ valid: true, user }` si le jeton est valide, sinon statut 401 avec
     *   `{ valid: false }`.
     */
    async verify(request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify()
        return { valid: true, user: request.user }
      } catch {
        return reply.code(401).send({ valid: false })
      }
    },
  }
}
