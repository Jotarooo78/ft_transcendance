/**
 * @file files.controller.ts
 * @brief Contrôleur des fichiers personnels : lister ses fichiers, revoir un fichier, en supprimer
 *   un.
 *
 * @details Un contrôleur est la couche qui parle HTTP : il lit la requête, appelle le service et
 *   renvoie le résultat. Les fonctions sont rattachées à leurs URL dans routes/files.routes.ts.
 */

import { invalidRequest, toPagination } from '@ft/service-kit'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FileParams, FilesQuery } from '../schemas/files.schema.js'
import type { FileDeletionService } from '../services/file-deletion.service.js'
import type { FilesService } from '../services/files.service.js'
import { sendFile } from './send-file.js'

/** @brief Type de l'objet renvoyé par `createFilesController` : une fonction par route. */
export type FilesController = ReturnType<typeof createFilesController>

/** @brief Requête dont l'URL contient l'identifiant d'un fichier. */
type FileRequest = FastifyRequest<{ Params: FileParams }>

/**
 * @brief Crée le contrôleur des fichiers personnels.
 * @param files Service de lecture.
 * @param deletions Service de suppression.
 * @returns Un objet contenant une fonction par route.
 */
export function createFilesController(files: FilesService, deletions: FileDeletionService) {
  return {
    /**
     * @brief Répond à `GET /assets` : renvoie une page des fichiers de l'utilisateur connecté.
     * @param request Requête reçue ; `request.query` contient `page` et `pageSize`.
     * @returns La page de fichiers.
     * @throws {DomainError} `400 invalid_request` si la pagination demandée dépasse les limites.
     */
    list(request: FastifyRequest<{ Querystring: FilesQuery }>) {
      const pagination = toPagination(request.query, { defaultPageSize: 50 })
      if (!pagination) {
        throw invalidRequest()
      }
      return files.list(request.userId, pagination)
    },

    /**
     * @brief Répond à `GET` et `HEAD /assets/:id/private-content` : envoie l'aperçu d'un fichier à
     *   son propriétaire.
     * @param request Requête reçue ; l'URL contient l'identifiant du fichier.
     * @param reply Réponse ; elle transporte l'image ou l'aperçu MP3.
     */
    async content(request: FileRequest, reply: FastifyReply) {
      const file = await files.openPrivateContent(request.userId, request.params.id.toLowerCase())
      reply.header('X-Content-Type-Options', 'nosniff')
      return sendFile(request, reply, file)
    },

    /**
     * @brief Répond à `DELETE /assets/:id` : supprime un fichier de l'utilisateur connecté.
     * @param request Requête reçue ; l'URL contient l'identifiant du fichier.
     * @param reply Réponse ; elle est envoyée avec le statut 204, qui signifie « fait, rien à
     *   renvoyer ».
     */
    async remove(request: FileRequest, reply: FastifyReply) {
      await deletions.remove(request.userId, request.params.id.toLowerCase())
      return reply.code(204).send()
    },
  }
}
