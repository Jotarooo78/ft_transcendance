/**
 * @file files.routes.ts
 * @brief Déclaration des routes de fichiers personnels : à quelle URL répond quelle fonction.
 *
 * @details Un fichier de routes est la table des matières d'une partie du service. Pour comprendre
 *   ce que fait une URL, pars d'ici. Ce fichier définit aussi, pour chaque route, le message en
 *   français affiché à l'utilisateur en cas d'erreur.
 */

import type { App } from '@ft/service-kit'
import type { FilesController } from '../controllers/files.controller.js'
import type { UploadController } from '../controllers/upload.controller.js'
import { FileParamsSchema, FilesQuerySchema } from '../schemas/files.schema.js'
import { refuseWith } from './refusals.js'

/** @brief Réponse d'erreur de l'envoi d'un fichier, avec son message pour l'utilisateur. */
const uploadRefusal = refuseWith({
  fallback: { status: 400, code: 'invalid_multipart' },
  message: (_status, code) =>
    code === 'upload_busy'
      ? 'Un envoi est déjà en cours. Réessayez.'
      : 'Fichier refusé ou service indisponible. Vérifiez le fichier puis réessayez.',
})

/** @brief Réponse d'erreur de la liste des fichiers. */
const listRefusal = refuseWith({
  fallback: { status: 503, code: 'files_unavailable' },
  message: (status) =>
    status === 400 ? 'Pagination invalide.' : 'Impossible de charger vos fichiers. Réessayez.',
})

/** @brief Réponse d'erreur de l'aperçu d'un fichier. */
const contentRefusal = refuseWith({
  fallback: { status: 503, code: 'files_unavailable' },
  message: () => 'Aperçu indisponible.',
})

/**
 * @brief Choisit le message affiché à l'utilisateur quand une suppression est refusée.
 * @param status Statut HTTP de la réponse.
 * @returns Le message : identifiant invalide, fichier encore utilisé, ou suppression indisponible.
 */
function deletionMessage(status: number): string {
  if (status === 400) {
    return 'Identifiant invalide.'
  }
  return status === 409
    ? 'Ce fichier est encore utilisé dans le catalogue.'
    : 'Suppression indisponible. Réessayez.'
}

/** @brief Réponse d'erreur de la suppression d'un fichier. */
const deletionRefusal = refuseWith({
  fallback: { status: 503, code: 'file_deletion_unavailable' },
  message: deletionMessage,
})

/**
 * @brief Déclare les quatre routes de fichiers personnels : envoi, liste, aperçu et suppression.
 * @details Toutes portent `onRequest: app.authenticate` : elles exigent le jeton de connexion, et
 *   chacun n'agit que sur ses propres fichiers.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param files Contrôleur de la liste, de l'aperçu et de la suppression.
 * @param uploads Contrôleur de l'envoi.
 */
export function registerFilesRoutes(app: App, files: FilesController, uploads: UploadController) {
  const onRequest = app.authenticate
  const params = FileParamsSchema

  app.post('/assets', { onRequest, errorHandler: uploadRefusal }, uploads.upload)

  app.get(
    '/assets',
    { onRequest, schema: { querystring: FilesQuerySchema }, errorHandler: listRefusal },
    files.list
  )

  app.route({
    method: ['GET', 'HEAD'],
    url: '/assets/:id/private-content',
    onRequest,
    schema: { params },
    errorHandler: contentRefusal,
    handler: files.content,
  })

  app.delete(
    '/assets/:id',
    { onRequest, schema: { params }, errorHandler: deletionRefusal },
    files.remove
  )
}
