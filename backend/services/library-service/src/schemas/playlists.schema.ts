/**
 * @file playlists.schema.ts
 * @brief Schémas des routes de playlists : ce qu'une requête doit contenir pour être acceptée, et
 *   ce qu'une réponse a le droit de contenir.
 *
 * @details Fastify compare chaque requête au schéma de sa route avant d'exécuter notre code. Si
 *   elle ne correspond pas (champ manquant, champ en trop, mauvais type), il répond `400
 *   invalid_request` et le contrôleur n'est jamais appelé.
 *
 * Les longueurs du nom et de la description ne sont pas vérifiées ici, car elles se mesurent après
 * avoir retiré les espaces, ce qu'un schéma ne sait pas faire. Elles sont vérifiées dans
 * domain/playlist.ts.
 */

import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'

/**
 * @brief Schéma du numéro de version que le client dit avoir lu : un nombre entier d'au moins 1.
 * @details Toute modification doit le fournir. Le serveur le compare à la version réelle pour
 *   détecter une modification concurrente.
 */
const visibility = Type.Union([Type.Literal('private'), Type.Literal('public')])

/** @brief Version de concurrence attendue. */
const expectedVersion = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })

/** @brief Partie variable de l'URL `/playlists/:id` : l'identifiant de la playlist. */
export const PlaylistParamsSchema = Type.Object({ id: UuidSchema })
/**
 * @brief Parties variables de l'URL `/playlists/:id/items/:itemId` : l'identifiant de la playlist
 *   et celui de l'occurrence à retirer.
 */
export const PlaylistItemParamsSchema = Type.Object({ id: UuidSchema, itemId: UuidSchema })

// Les longueurs se mesurent après nettoyage : elles sont contrôlées dans domain/playlist.ts.
/**
 * @brief Corps accepté par `POST /playlists` : un nom obligatoire et une description facultative,
 *   rien d'autre.
 */
export const CreatePlaylistBodySchema = Type.Object(
  {
    name: Type.String(),
    description: Type.Optional(Type.String()),
    visibility: Type.Optional(visibility),
  },
  { additionalProperties: false }
)

/**
 * @brief Corps accepté par `PATCH /playlists/:id` : la version lue, et le nom et/ou la description
 *   à changer.
 */
export const EditPlaylistBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    visibility: Type.Optional(visibility),
    expectedVersion,
  },
  { additionalProperties: false }
)

/** @brief Corps accepté par les suppressions : uniquement la version lue. */
export const VersionBodySchema = Type.Object({ expectedVersion }, { additionalProperties: false })

/**
 * @brief Corps accepté par `POST /playlists/:id/items` : l'identifiant du morceau à ajouter et la
 *   version lue.
 */
export const AddItemBodySchema = Type.Object(
  { trackId: UuidSchema, expectedVersion },
  { additionalProperties: false }
)

/** @brief Forme d'une playlist dans une réponse. Seuls ces champs sont envoyés au client. */
export const PlaylistSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.String(),
  visibility,
  version: Type.Integer(),
  items: Type.Array(
    Type.Object({ id: Type.String(), trackId: Type.String(), position: Type.Integer() })
  ),
})

/**
 * @brief Forme de la réponse de `GET /playlists` : les playlists de la page, leur nombre total, et
 *   la page demandée.
 */
export const PlaylistPageSchema = Type.Object({
  items: Type.Array(PlaylistSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
})

/** @brief Type TypeScript de la partie variable de l'URL d'une playlist, déduit du schéma. */
export type PlaylistParams = Static<typeof PlaylistParamsSchema>
/** @brief Type TypeScript des parties variables de l'URL d'une occurrence, déduit du schéma. */
export type PlaylistItemParams = Static<typeof PlaylistItemParamsSchema>
/** @brief Type TypeScript du corps de création, déduit du schéma. */
export type CreatePlaylistBody = Static<typeof CreatePlaylistBodySchema>
/** @brief Type TypeScript du corps de modification, déduit du schéma. */
export type EditPlaylistBody = Static<typeof EditPlaylistBodySchema>
/** @brief Type TypeScript du corps d'une suppression, déduit du schéma. */
export type VersionBody = Static<typeof VersionBodySchema>
/** @brief Type TypeScript du corps d'ajout d'un morceau, déduit du schéma. */
export type AddItemBody = Static<typeof AddItemBodySchema>
