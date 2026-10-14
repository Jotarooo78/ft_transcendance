/**
 * @file tracks.controller.ts
 * @brief Contrôleur des morceaux : relie les requêtes HTTP `GET /tracks` et `GET /tracks/:id` au
 *   service qui sait y répondre.
 *
 * @details Un contrôleur est la couche qui parle HTTP. Quand il est appelé, Fastify a déjà vérifié
 *   que la requête a la bonne forme (voir schemas/tracks.schema.ts). Le contrôleur en extrait ce
 *   dont le service a besoin (ici les paramètres de l'URL), appelle le service, et renvoie ce que
 *   le service lui donne ; Fastify se charge de l'écrire en JSON.
 *
 * Un contrôleur ne contient aucune règle métier et aucune requête SQL. Si une règle doit changer,
 * c'est dans services/ ou domain/. Les fonctions de ce fichier sont rattachées à leurs URL dans
 * routes/tracks.routes.ts.
 */

import type { FastifyRequest } from 'fastify'
import { toTrackListQuery } from '../domain/track-list.js'
import type { TrackParams, TrackQuery } from '../schemas/tracks.schema.js'
import type { TracksService } from '../services/tracks.service.js'

/**
 * @brief Type de l'objet renvoyé par `createTracksController` : l'ensemble des fonctions qui
 *   répondent aux routes de morceaux.
 * @details Le fichier de routes s'en sert pour savoir quelles fonctions il peut brancher sur les
 *   URL.
 */
export type TracksController = ReturnType<typeof createTracksController>

/**
 * @brief Crée le contrôleur des morceaux.
 * @param tracks Service des morceaux, que les fonctions du contrôleur appellent.
 * @returns Un objet contenant une fonction par route.
 */
export function createTracksController(tracks: TracksService) {
  return {
    /**
     * @brief Répond à `GET /tracks` : renvoie une page de morceaux publiés.
     * @details Les paramètres de l'URL (page, taille, recherche, genre, tri) sont d'abord complétés
     *   par leurs valeurs par défaut, puis transmis au service.
     * @param request Requête reçue ; `request.query` contient les paramètres de l'URL, déjà
     *   validés.
     * @returns La page de morceaux, que Fastify envoie en JSON avec le statut 200.
     */
    list(request: FastifyRequest<{ Querystring: TrackQuery }>) {
      return tracks.list(toTrackListQuery(request.query))
    },

    /**
     * @brief Répond à `GET /tracks/:id` : renvoie un morceau publié.
     * @param request Requête reçue ; `request.params.id` contient l'identifiant lu dans l'URL, déjà
     *   validé.
     * @returns Le morceau. Si le service lève « morceau introuvable », la réponse est 404.
     */
    show(request: FastifyRequest<{ Params: TrackParams }>) {
      return tracks.get(request.params.id)
    },
  }
}
