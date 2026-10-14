/**
 * @file assets.schema.ts
 * @brief Schémas des deux routes par lesquelles media-service interroge le catalogue au sujet d'un
 *   fichier.
 *
 * @details Rappel du contexte : les fichiers audio et les images sont stockés par media-service,
 *   mais c'est le catalogue qui sait quels morceaux les utilisent. Avant de diffuser un audio ou de
 *   supprimer un fichier, Media pose donc une question au catalogue. Ces schémas décrivent la forme
 *   de ces questions et de leurs réponses.
 */

import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'

/**
 * @brief Partie variable de l'URL : l'identifiant du fichier dans Media, qui doit avoir la forme
 *   d'un UUID.
 */
export const AssetParamsSchema = Type.Object({ id: UuidSchema })

/**
 * @brief Réponse à « cet audio appartient-il à un morceau publié ? » : un objet contenant le seul
 *   champ booléen `published`.
 */
export const PublicationSchema = Type.Object({ published: Type.Boolean() })

/**
 * @brief Réponse à « ce fichier est-il encore utilisé par le catalogue ? » : un objet contenant le
 *   seul champ booléen `referenced`.
 */
export const ReferencesSchema = Type.Object({ referenced: Type.Boolean() })

/** @brief Type TypeScript de la partie variable de l'URL, déduit de `AssetParamsSchema`. */
export type AssetParams = Static<typeof AssetParamsSchema>
