/**
 * @file files.schema.ts
 * @brief Schémas des routes de fichiers : ce qu'une requête doit contenir pour être acceptée.
 *
 * @details Fastify compare chaque requête au schéma de sa route avant d'exécuter notre code ; si
 *   elle ne correspond pas, le contrôleur n'est pas appelé.
 */

import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'

/** @brief Partie variable de l'URL `/assets/:id` : l'identifiant du fichier. */
export const FileParamsSchema = Type.Object({ id: UuidSchema })

/** @brief Pagination des fichiers : page sur 4 chiffres au plus, taille de page sur 3. */
export const FilesQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,3}$' })),
    pageSize: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,2}$' })),
  },
  { additionalProperties: false }
)

/** @brief Type TypeScript de la partie variable de l'URL d'un fichier, déduit du schéma. */
export type FileParams = Static<typeof FileParamsSchema>
/**
 * @brief Type TypeScript des paramètres de pagination de la liste des fichiers, déduit du schéma.
 */
export type FilesQuery = Static<typeof FilesQuerySchema>
