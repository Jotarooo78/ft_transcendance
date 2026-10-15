/**
 * @file upload.controller.ts
 * @brief Contrôleur de l'envoi d'un fichier.
 *
 * @details Il coordonne trois choses : le garde-fou « un seul envoi à la fois », la réception du
 *   formulaire, et l'annulation si le navigateur ferme la connexion avant la fin. La fonction est
 *   rattachée à son URL dans routes/files.routes.ts.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { uploadBusy } from '../domain/errors.js'
import type { UploadGate } from '../services/upload-gate.js'
import type { AudioUploadService } from '../services/audio-upload.service.js'
import { receiveSingleFile } from './receive-upload.js'

/** @brief Type de l'objet renvoyé par `createUploadController`. */
export type UploadController = ReturnType<typeof createUploadController>

/**
 * @brief Crée le contrôleur d'envoi.
 * @param uploads Service d'envoi.
 * @param gate Garde-fou « un seul envoi à la fois ».
 * @returns Un objet contenant la fonction de la route.
 */
export function createUploadController(uploads: AudioUploadService, gate: UploadGate) {
  return {
    /**
     * @brief Répond à `POST /assets` : reçoit un fichier envoyé par l'utilisateur connecté.
     * @details La réponse 201 n'est envoyée qu'une fois le fichier vérifié, écrit durablement sur
     *   le disque et enregistré en base. Si le navigateur ferme la connexion avant, la réception et
     *   le décodage en cours sont annulés.
     * @param request Requête contenant le formulaire avec le fichier.
     * @param reply Réponse.
     * @throws {DomainError} `503 upload_busy` si un autre envoi est déjà en cours.
     */
    async upload(
      request: FastifyRequest<{ Querystring: { temporary?: string } }>,
      reply: FastifyReply
    ) {
      if (!gate.tryEnter()) {
        throw uploadBusy()
      }
      const controller = new AbortController()
      /** @brief Annule la réception et le décodage en cours. */
      const abort = () => controller.abort()
      // Une connexion fermée avant la fin de la réponse annule le transfert et le décodage.
      /**
       * @brief Annule l'envoi si le navigateur ferme la connexion avant que la réponse soit
       *   terminée.
       */
      const onClose = () => {
        if (!reply.raw.writableEnded) {
          abort()
        }
      }
      request.raw.on('aborted', abort)
      reply.raw.on('close', onClose)
      try {
        /** @brief Écrit le fichier reçu à l'endroit que le service d'envoi a choisi. */
        const receive = (path: string) => receiveSingleFile(request, path, controller.signal)
        const asset = await uploads.save(
          request.userId,
          receive,
          controller.signal,
          request.query.temporary === '1'
        )
        return reply.code(201).send(asset)
      } finally {
        gate.leave()
        request.raw.off('aborted', abort)
        reply.raw.off('close', onClose)
      }
    },
  }
}
