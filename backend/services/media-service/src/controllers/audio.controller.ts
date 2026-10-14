/**
 * @file audio.controller.ts
 * @brief Contrôleur de l'écoute publique : envoie au lecteur audio le fichier d'un morceau publié.
 *
 * @details C'est la route que la balise audio du navigateur appelle pour jouer un morceau. Elle ne
 *   demande pas de connexion. La fonction est rattachée à son URL dans routes/audio.routes.ts.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { parseByteRange } from '../domain/byte-range.js'
import type { FileParams } from '../schemas/files.schema.js'
import type { FilesService } from '../services/files.service.js'
import { sendFile } from './send-file.js'

/** @brief Type de l'objet renvoyé par `createAudioController`. */
export type AudioController = ReturnType<typeof createAudioController>

/**
 * @brief Crée le contrôleur de l'écoute publique.
 * @param files Service de lecture des fichiers.
 * @returns Un objet contenant la fonction de la route.
 */
export function createAudioController(files: FilesService) {
  return {
    /**
     * @brief Répond à `GET` et `HEAD /assets/:id/audio` : envoie le fichier audio.
     * @param request Requête reçue ; elle peut porter un en-tête `Range` pour ne demander qu'une
     *   partie du fichier.
     * @param reply Réponse : statut 200 pour le fichier entier, 206 pour une partie, 416 si la
     *   partie demandée est invalide.
     */
    async stream(request: FastifyRequest<{ Params: FileParams }>, reply: FastifyReply) {
      const file = await files.openPublicAudio(request.params.id.toLowerCase())
      reply.header('Accept-Ranges', 'bytes')

      const rangeHeader = request.method === 'GET' ? request.headers.range : undefined
      if (rangeHeader === undefined) {
        return sendFile(request, reply, file)
      }
      const range = parseByteRange(rangeHeader, file.size)
      if (!range) {
        await file.handle.close()
        reply.header('Content-Range', `bytes */${file.size}`)
        return reply.code(416).send({ error: 'invalid_range' })
      }
      reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${file.size}`)
      return sendFile(request, reply, file, range)
    },
  }
}
