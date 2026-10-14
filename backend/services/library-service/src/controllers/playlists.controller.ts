/**
 * @file playlists.controller.ts
 * @brief Contrôleur des playlists : relie les requêtes HTTP sur `/playlists` au service qui sait y
 *   répondre.
 *
 * @details Un contrôleur est la couche qui parle HTTP. Quand il est appelé, deux choses ont déjà eu
 *   lieu : le jeton de connexion a été vérifié (l'identifiant du compte est dans `request.userId`)
 *   et la forme de la requête a été validée par les schémas. Le contrôleur extrait ce dont le
 *   service a besoin, l'appelle, et renvoie le résultat ; Fastify l'écrit en JSON.
 *
 * Aucune règle métier ici : elles sont dans services/ et domain/. Les fonctions de ce fichier sont
 * rattachées à leurs URL dans routes/playlists.routes.ts.
 */

import { invalidRequest, toPagination, type PageQuery } from '@ft/service-kit'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { toPlaylistChanges, toPlaylistInput } from '../domain/playlist.js'
import type {
  CreatePlaylistBody,
  EditPlaylistBody,
  PlaylistParams,
  VersionBody,
} from '../schemas/playlists.schema.js'
import type { PlaylistsService } from '../services/playlists.service.js'

/**
 * @brief Type de l'objet renvoyé par `createPlaylistsController` : une fonction par route de
 *   playlist.
 */
export type PlaylistsController = ReturnType<typeof createPlaylistsController>

/** @brief Requête qui vise une playlist précise (identifiant dans l'URL) et transporte un corps. */
type Versioned<Body> = FastifyRequest<{ Params: PlaylistParams; Body: Body }>

/**
 * @brief Rassemble les trois informations nécessaires à une modification.
 * @param request Requête déjà authentifiée et validée.
 * @returns Le compte (lu dans le jeton), la playlist (lue dans l'URL, mise en minuscules) et la
 *   version attendue (lue dans le corps).
 */
const keyOf = (request: Versioned<{ expectedVersion: number }>) => ({
  owner: request.userId,
  id: request.params.id.toLowerCase(),
  expectedVersion: request.body.expectedVersion,
})

/**
 * @brief Crée le contrôleur des playlists.
 * @param playlists Service des playlists, que les fonctions du contrôleur appellent.
 * @returns Un objet contenant une fonction par route.
 */
export function createPlaylistsController(playlists: PlaylistsService) {
  return {
    /**
     * @brief Répond à `GET /playlists` : renvoie une page des playlists du compte connecté.
     * @param request Requête reçue ; `request.query` contient `page` et `pageSize`.
     * @returns La page de playlists.
     * @throws {DomainError} `400 invalid_request` si la pagination demandée dépasse les limites.
     */
    list(request: FastifyRequest<{ Querystring: PageQuery }>) {
      const pagination = toPagination(request.query)
      if (!pagination) {
        throw invalidRequest()
      }
      return playlists.list(request.userId, pagination)
    },

    /**
     * @brief Répond à `GET /playlists/:id` : renvoie une playlist du compte connecté.
     * @param request Requête reçue ; `request.params.id` est l'identifiant de la playlist.
     * @returns La playlist.
     */
    show(request: FastifyRequest<{ Params: PlaylistParams }>) {
      return playlists.get(request.userId, request.params.id.toLowerCase())
    },

    /**
     * @brief Répond à `POST /playlists` : crée une playlist vide.
     * @param request Requête reçue ; `request.body` contient le nom et la description.
     * @param reply Réponse ; elle est envoyée avec le statut 201, qui signifie « créé ».
     */
    async create(request: FastifyRequest<{ Body: CreatePlaylistBody }>, reply: FastifyReply) {
      const playlist = await playlists.create(request.userId, toPlaylistInput(request.body))
      return reply.code(201).send(playlist)
    },

    /**
     * @brief Répond à `PATCH /playlists/:id` : change le nom et/ou la description.
     * @param request Requête reçue ; le corps contient la version lue et les champs à changer.
     * @returns La playlist à jour.
     */
    update(request: Versioned<EditPlaylistBody>) {
      return playlists.update(keyOf(request), toPlaylistChanges(request.body))
    },

    /**
     * @brief Répond à `DELETE /playlists/:id` : supprime la playlist.
     * @param request Requête reçue ; le corps contient la version lue.
     * @param reply Réponse ; elle est envoyée avec le statut 204, qui signifie « fait, rien à
     *   renvoyer ».
     */
    async remove(request: Versioned<VersionBody>, reply: FastifyReply) {
      await playlists.remove(keyOf(request))
      return reply.code(204).send()
    },
  }
}
