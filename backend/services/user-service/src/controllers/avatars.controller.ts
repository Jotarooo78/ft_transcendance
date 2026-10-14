/**
 * @file avatars.controller.ts
 * @brief Contrôleur des avatars : reçoit l'image envoyée par le navigateur et sert les images
 *   enregistrées.
 *
 * @details Un fichier n'arrive pas en JSON mais dans un formulaire d'un format particulier, appelé
 *   « multipart ». Ce contrôleur en extrait le fichier, puis laisse le service décider s'il est
 *   acceptable. Les fonctions sont rattachées à leurs URL dans routes/avatars.routes.ts.
 */

import '@fastify/multipart'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { avatarFieldRequired, avatarFileRequired, avatarTooLarge } from '../domain/errors.js'
import type { AvatarsService } from '../services/avatars.service.js'

/**
 * @brief Type de l'objet renvoyé par `createAvatarsController` : une fonction pour l'envoi, une
 *   pour la lecture, une pour la suppression.
 */
export type AvatarsController = ReturnType<typeof createAvatarsController>

/**
 * @brief Code de l'erreur que lève la bibliothèque de lecture des formulaires quand le fichier
 *   dépasse la taille autorisée.
 */
const fileTooLargeCode = 'FST_REQ_FILE_TOO_LARGE'

/**
 * @brief Extrait du formulaire le fichier du champ `avatar`.
 * @param request Requête reçue.
 * @returns Le type d'image annoncé par le navigateur et le contenu du fichier.
 * @throws {DomainError} 400 si la requête n'est pas un formulaire avec fichier ou n'a pas de champ
 *   `avatar` ; 413 si le fichier dépasse 2 Mio.
 */
async function readAvatarPart(request: FastifyRequest) {
  if (!request.isMultipart()) {
    throw avatarFileRequired()
  }
  const part = await request.file()
  if (!part || part.fieldname !== 'avatar') {
    throw avatarFieldRequired()
  }
  const bytes = await part.toBuffer().catch((error: NodeJS.ErrnoException) => {
    throw error.code === fileTooLargeCode ? avatarTooLarge() : error
  })
  return { declaredMime: part.mimetype, bytes }
}

/**
 * @brief Crée le contrôleur des avatars.
 * @param avatars Service des avatars.
 * @returns Un objet contenant une fonction par route.
 */
export function createAvatarsController(avatars: AvatarsService) {
  return {
    /**
     * @brief Répond à `POST /me/avatar` : enregistre la nouvelle image de profil de l'utilisateur
     *   connecté.
     * @param request Requête reçue, contenant le formulaire avec le fichier.
     * @returns Le profil à jour.
     */
    async upload(request: FastifyRequest) {
      const { declaredMime, bytes } = await readAvatarPart(request)
      return avatars.save(request.userId, declaredMime, bytes)
    },

    /**
     * @brief Répond à `GET /avatars/:fileName` : envoie l'image demandée. Route accessible sans
     *   être connecté.
     * @param request Requête reçue ; l'URL contient le nom du fichier.
     * @param reply Réponse ; elle transporte l'image et son type.
     */
    async show(request: FastifyRequest<{ Params: { fileName: string } }>, reply: FastifyReply) {
      const { bytes, contentType } = await avatars.read(request.params.fileName)
      return reply.type(contentType).send(bytes)
    },

    /**
     * @brief Répond à `DELETE /me/avatar` : supprime l'image de profil de l'utilisateur connecté.
     * @param request Requête reçue ; l'identité vient du jeton de connexion, jamais du client.
     * @returns Le profil à jour, sans adresse d'avatar.
     */
    async remove(request: FastifyRequest) {
      return avatars.remove(request.userId)
    },
  }
}
