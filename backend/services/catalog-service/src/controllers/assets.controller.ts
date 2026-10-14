/**
 * @file assets.controller.ts
 * @brief Contrôleur des deux routes par lesquelles media-service interroge le catalogue au sujet
 *   d'un fichier.
 *
 * @details Pourquoi ces routes existent : les fichiers audio et les images sont stockés par
 *   media-service, mais seul le catalogue sait quels morceaux, albums ou artistes les utilisent.
 *   Media appelle donc le catalogue par HTTP dans deux situations. Avant de diffuser un audio à
 *   tout le monde, il demande « ce fichier est-il l'audio d'un morceau publié ? ». Avant de
 *   supprimer un fichier, il demande « ce fichier est-il encore utilisé ? ».
 *
 * Ce contrôleur reçoit ces deux questions, les transmet au service et renvoie un simple oui ou non.
 * Il ne révèle rien d'autre sur le catalogue. Les fonctions sont rattachées à leurs URL dans
 * routes/assets.routes.ts.
 */

import type { FastifyRequest } from 'fastify'
import type { AssetParams } from '../schemas/assets.schema.js'
import type { AssetsService } from '../services/assets.service.js'

/**
 * @brief Type de l'objet renvoyé par `createAssetsController` : les deux fonctions qui répondent
 *   aux questions de Media.
 */
export type AssetsController = ReturnType<typeof createAssetsController>

/** @brief Requête dont l'URL contient l'identifiant d'un fichier (`request.params.id`). */
type AssetRequest = FastifyRequest<{ Params: AssetParams }>

/**
 * @brief Crée le contrôleur des questions sur les fichiers.
 * @param assets Service qui sait répondre aux deux questions.
 * @returns Un objet contenant une fonction par route.
 */
export function createAssetsController(assets: AssetsService) {
  return {
    /**
     * @brief Répond à `GET /assets/:id/publication` : dit si ce fichier est l'audio d'un morceau
     *   publié.
     * @details Media appelle cette route avant de diffuser un audio. La route est publique car la
     *   réponse ne révèle qu'un oui ou un non.
     * @param request Requête reçue ; `request.params.id` est l'identifiant du fichier.
     * @returns `{ published: true }` ou `{ published: false }`.
     */
    async publication(request: AssetRequest) {
      return { published: await assets.isPublished(request.params.id) }
    },

    /**
     * @brief Répond à `GET /internal/assets/:id/references` : dit si le catalogue utilise encore ce
     *   fichier.
     * @details Media appelle cette route avant de supprimer un fichier. Elle est réservée aux
     *   services : l'appelant doit présenter le jeton interne, et Nginx la bloque depuis
     *   l'extérieur.
     * @param request Requête reçue, déjà authentifiée par le jeton interne.
     * @returns `{ referenced: true }` si le fichier ne doit pas être supprimé, sinon `{ referenced:
     *   false }`.
     */
    async references(request: AssetRequest) {
      return { referenced: await assets.isReferenced(request.params.id) }
    },
  }
}
