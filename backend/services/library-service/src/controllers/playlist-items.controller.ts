/**
 * @file playlist-items.controller.ts
 * @brief Contrôleur des morceaux d'une playlist : relie les requêtes d'ajout et de retrait au
 *   service correspondant.
 *
 * @details Comme tout contrôleur, il ne fait que traduire : il lit dans la requête le compte
 *   connecté, la playlist visée, la version attendue et le morceau, puis appelle le service. Les
 *   fonctions sont rattachées à leurs URL dans routes/playlist-items.routes.ts.
 */

import type { FastifyRequest } from 'fastify'
import type {
  AddItemBody,
  PlaylistItemParams,
  PlaylistParams,
  VersionBody,
} from '../schemas/playlists.schema.js'
import type { PlaylistItemsService } from '../services/playlist-items.service.js'

/**
 * @brief Type de l'objet renvoyé par `createPlaylistItemsController` : une fonction pour l'ajout,
 *   une pour le retrait.
 */
export type PlaylistItemsController = ReturnType<typeof createPlaylistItemsController>

/**
 * @brief Crée le contrôleur des morceaux d'une playlist.
 * @param items Service qui ajoute et retire les morceaux.
 * @returns Un objet contenant une fonction par route.
 */
export function createPlaylistItemsController(items: PlaylistItemsService) {
  return {
    /**
     * @brief Répond à `POST /playlists/:id/items` : ajoute un morceau à la fin de la playlist.
     * @param request Requête reçue ; le corps contient l'identifiant du morceau et la version lue.
     * @returns La playlist à jour.
     */
    add(request: FastifyRequest<{ Params: PlaylistParams; Body: AddItemBody }>) {
      const { trackId, expectedVersion } = request.body
      const key = { owner: request.userId, id: request.params.id.toLowerCase(), expectedVersion }
      return items.add(key, trackId.toLowerCase())
    },

    /**
     * @brief Répond à `DELETE /playlists/:id/items/:itemId` : retire une occurrence de la playlist.
     * @param request Requête reçue ; l'URL contient la playlist et l'occurrence, le corps la
     *   version lue.
     * @returns La playlist à jour.
     */
    remove(request: FastifyRequest<{ Params: PlaylistItemParams; Body: VersionBody }>) {
      const { id, itemId } = request.params
      const key = {
        owner: request.userId,
        id: id.toLowerCase(),
        expectedVersion: request.body.expectedVersion,
      }
      return items.remove(key, itemId.toLowerCase())
    },
  }
}
