/**
 * @file tracks.schema.ts
 * @brief Schémas des routes de morceaux : ce qu'une requête doit contenir pour être acceptée, et ce
 *   qu'une réponse a le droit de contenir.
 *
 * @details Un schéma est une description de forme : « un objet avec tel champ, de tel type ».
 *   Fastify compare chaque requête au schéma de sa route avant d'exécuter notre code ; si elle ne
 *   correspond pas, il répond `400 invalid_request` et le contrôleur n'est jamais appelé. Le code
 *   qui suit peut donc faire confiance à la forme de ce qu'il reçoit.
 *
 * Les schémas de réponse servent dans l'autre sens : seuls les champs qu'ils décrivent sont envoyés
 * au client. Un champ ajouté par erreur dans le code, mais absent du schéma, ne fuit pas.
 *
 * Chaque schéma est accompagné d'un type TypeScript calculé automatiquement à partir de lui
 * (`Static<typeof ...>`) : la validation et le typage ne peuvent pas se contredire.
 */

import { UuidSchema } from '@ft/service-kit'
import { Type, type Static } from 'typebox'

/**
 * @brief Schéma d'un entier strictement positif écrit en chiffres, par exemple `"3"`.
 * @details Les paramètres d'URL sont toujours du texte : on vérifie donc un motif de texte, et la
 *   conversion en nombre est faite ensuite dans le code.
 */
const positiveInteger = Type.String({ pattern: '^[1-9][0-9]*$' })
/**
 * @brief Schéma d'un texte de recherche ou de filtre, limité à 200 caractères pour éviter des
 *   requêtes démesurées.
 */
const searchText = Type.String({ maxLength: 200 })
/**
 * @brief Fabrique le schéma « soit cette valeur, soit null ».
 * @details Utile pour les champs facultatifs d'une réponse, comme la durée d'un morceau qui n'en a
 *   pas encore.
 * @param schema Schéma de la valeur quand elle est présente.
 * @returns Un schéma qui accepte la valeur ou null.
 */
const nullable = <T extends Parameters<typeof Type.Union>[0][number]>(schema: T) =>
  Type.Union([schema, Type.Null()])

/**
 * @brief Paramètres acceptés dans l'URL de `GET /tracks`.
 * @details Tous sont facultatifs. Tout paramètre qui ne figure pas dans cette liste fait refuser la
 *   requête (`additionalProperties: false`) : une faute de frappe dans un nom de paramètre est
 *   ainsi signalée au lieu d'être ignorée en silence.
 */
export const TrackQuerySchema = Type.Object(
  {
    page: Type.Optional(positiveInteger),
    pageSize: Type.Optional(positiveInteger),
    q: Type.Optional(searchText),
    genre: Type.Optional(searchText),
    sort: Type.Optional(
      Type.Union([Type.Literal('title'), Type.Literal('artist'), Type.Literal('duration')])
    ),
  },
  { additionalProperties: false }
)

/**
 * @brief Partie variable de l'URL `GET /tracks/:id` : l'identifiant du morceau, qui doit avoir la
 *   forme d'un UUID.
 */
export const TrackParamsSchema = Type.Object({ id: UuidSchema })

/**
 * @brief Forme d'un morceau dans une réponse.
 * @details C'est la liste exacte des champs envoyés au client. Les champs suivis de `nullable`
 *   peuvent valoir null.
 */
export const TrackSchema = Type.Object({
  artistUserId: Type.Optional(Type.String()),
  description: Type.Optional(nullable(Type.String())),
  coverUrl: Type.Optional(nullable(Type.String())),
  artistAvatarUrl: Type.Optional(nullable(Type.String())),
  id: Type.String(),
  title: Type.String(),
  artistName: Type.String(),
  albumTitle: Type.String(),
  genre: Type.String(),
  durationMs: nullable(Type.Integer()),
  durationSeconds: nullable(Type.Number()),
  audioAssetId: nullable(Type.String()),
  audioUrl: nullable(Type.String()),
})

/**
 * @brief Forme de la réponse de `GET /tracks` : les morceaux de la page, le total, la page demandée
 *   et les genres disponibles.
 */
export const TrackPageSchema = Type.Object({
  items: Type.Array(TrackSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
  genres: Type.Array(Type.String()),
})

/**
 * @brief Type TypeScript des paramètres de `GET /tracks` après validation, déduit de
 *   `TrackQuerySchema`.
 */
export type TrackQuery = Static<typeof TrackQuerySchema>
/**
 * @brief Type TypeScript de la partie variable de l'URL d'un morceau, déduit de
 *   `TrackParamsSchema`.
 */
export type TrackParams = Static<typeof TrackParamsSchema>
