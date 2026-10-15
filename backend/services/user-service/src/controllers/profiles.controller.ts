/**
 * @file profiles.controller.ts
 * @brief Contrôleur des profils : relie les requêtes HTTP sur les profils au service qui sait y
 *   répondre.
 *
 * @details Un contrôleur est la couche qui parle HTTP. Il lit dans la requête ce dont le service a
 *   besoin (l'identifiant du compte connecté dans `request.userId`, les parties variables de l'URL,
 *   le corps), appelle le service et renvoie le résultat, que Fastify écrit en JSON.
 *
 * Aucune règle métier ici. Les fonctions de ce fichier sont rattachées à leurs URL dans
 * routes/profiles.routes.ts.
 */

import { toPagination, invalidRequest } from '@ft/service-kit'
import type { FastifyRequest } from 'fastify'
import { invalidUserId } from '../domain/errors.js'
import { isUuid } from '../domain/identifiers.js'
import { toProfileUpdate } from '../domain/profile.js'
import type { ProfilesService } from '../services/profiles.service.js'

/**
 * @brief Type de l'objet renvoyé par `createProfilesController` : une fonction par route de profil.
 */
export type ProfilesController = ReturnType<typeof createProfilesController>

/**
 * @brief Crée le contrôleur des profils.
 * @param profiles Service des profils, que les fonctions du contrôleur appellent.
 * @returns Un objet contenant une fonction par route.
 */
export function createProfilesController(profiles: ProfilesService) {
  return {
    /** Recherche publique bornée, validée par la route. */
    searchArtists(
      request: FastifyRequest<{ Querystring: { q?: string; page?: string; pageSize?: string } }>
    ) {
      const pagination = toPagination(request.query, {
        defaultPageSize: 24,
        maxPageSize: 50,
        maxOffset: 5000000,
      })
      if (!pagination) throw invalidRequest()
      return profiles.searchArtists(request.query.q ?? '', pagination.page, pagination.pageSize)
    },
    /** Profil public d’artiste avec sa bio ; aucune donnée de connexion n’est renvoyée. */
    artist(request: FastifyRequest<{ Params: { userId: string } }>) {
      if (!isUuid(request.params.userId)) throw invalidUserId()
      return profiles.me(request.params.userId.toLowerCase())
    },
    /**
     * @brief Répond à `GET /me` : renvoie le profil complet de l'utilisateur connecté.
     * @param request Requête reçue, avec un jeton de connexion valide.
     * @returns Le profil.
     */
    me(request: FastifyRequest) {
      return profiles.me(request.userId)
    },

    /**
     * @brief Répond à `PUT /me/profile` : modifie le profil de l'utilisateur connecté.
     * @param request Requête reçue ; le corps contient le nom affiché, le username et la bio.
     * @returns Le profil à jour.
     */
    update(request: FastifyRequest) {
      return profiles.update(request.userId, toProfileUpdate(request.body))
    },

    /**
     * @brief Répond à `GET /profiles` : renvoie la liste des autres utilisateurs.
     * @param request Requête reçue, avec un jeton de connexion valide.
     * @returns Un objet `{ users }`.
     */
    async directory(request: FastifyRequest) {
      return {
        /** Profil public d’artiste avec sa bio ; aucune donnée de connexion n’est renvoyée. */
        artist(request: FastifyRequest<{ Params: { userId: string } }>) {
          if (!isUuid(request.params.userId)) throw invalidUserId()
          return profiles.me(request.params.userId.toLowerCase())
        },
        users: await profiles.directory(request.userId),
      }
    },

    /**
     * @brief Répond à `GET /profile/:userId` : renvoie le profil public d'un compte. Route
     *   accessible sans être connecté.
     * @param request Requête reçue ; l'URL contient l'identifiant du compte.
     * @returns Le profil public.
     * @throws {DomainError} 400 `invalid user id` si l'identifiant n'a pas le format attendu.
     */
    show(request: FastifyRequest<{ Params: { userId: string } }>) {
      if (!isUuid(request.params.userId)) {
        throw invalidUserId()
      }
      return profiles.publicProfile(request.params.userId)
    },
  }
}
