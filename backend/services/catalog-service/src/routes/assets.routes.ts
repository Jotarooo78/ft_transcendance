/**
 * @file assets.routes.ts
 * @brief Déclaration des deux routes que media-service appelle pour s'informer sur un fichier.
 *
 * @details La première, `GET /assets/:id/publication`, est publique. La seconde, `GET
 *   /internal/assets/:id/references`, est interne : elle exige un secret partagé entre services (le
 *   jeton interne) et Nginx la bloque depuis l'extérieur, si bien que seul un autre service du
 *   réseau Docker peut l'appeler.
 */

import { noStore, type App } from '@ft/service-kit'
import type { AssetsController } from '../controllers/assets.controller.js'
import { AssetParamsSchema, PublicationSchema, ReferencesSchema } from '../schemas/assets.schema.js'

/**
 * @brief Déclare les deux routes sur le serveur.
 * @details Les deux réponses portent l'en-tête `Cache-Control: no-store`, qui interdit de les
 *   garder en mémoire : la réponse peut changer d'un instant à l'autre (un morceau peut être publié
 *   ou dépublié), et une réponse périmée ferait diffuser ou supprimer un fichier à tort.
 *   `onRequest` désigne une fonction exécutée dès l'arrivée de la requête, avant toute validation :
 *   c'est là qu'on pose cet en-tête et qu'on vérifie le jeton interne.
 * @param app Serveur Fastify sur lequel déclarer les routes.
 * @param assets Contrôleur dont les fonctions répondent à ces routes.
 */
export function registerAssetsRoutes(app: App, assets: AssetsController) {
  app.get(
    '/assets/:id/publication',
    {
      onRequest: noStore,
      schema: { params: AssetParamsSchema, response: { 200: PublicationSchema } },
    },
    assets.publication
  )

  app.get(
    '/internal/assets/:id/references',
    {
      onRequest: app.requireInternalToken,
      schema: { params: AssetParamsSchema, response: { 200: ReferencesSchema } },
    },
    assets.references
  )
}
